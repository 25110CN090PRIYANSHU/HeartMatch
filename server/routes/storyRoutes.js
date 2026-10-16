const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const Story = require("../models/Story");
const User = require("../models/User");
const Like = require("../models/Like");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const Block = require("../models/Block");
const authMiddleware = require("../middleware/authMiddleware");
const { sendPushNotification } = require("../utils/pushNotifier");

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "video/quicktime"
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Unsupported media type. Please upload JPG, PNG, WebP, GIF, or MP4."));
        }
    }
});

module.exports = (io) => {
    const router = express.Router();

    // Helper: get GridFS bucket for stories
    function getStoryBucket() {
        if (!mongoose.connection.db) return null;
        return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: "storyImages"
        });
    }

    // ==================================================
    // 1. GET STORIES TRAY (Self + Mutual Matches)
    // ==================================================
    router.get("/tray", authMiddleware, async (req, res) => {
        try {
            const now = new Date();
            const currentUserId = req.userId.toString();

            // Fetch current user details
            const myUser = await User.findById(req.userId)
                .select("_id name profileImage photos")
                .lean();

            // Fetch all my active stories (sorted oldest to newest)
            const myStoriesRaw = await Story.find({
                user: req.userId,
                expiresAt: { $gt: now }
            })
                .sort({ createdAt: 1 })
                .populate("views.user", "_id name profileImage")
                .lean();

            const myStories = myStoriesRaw.map((s) => ({
                _id: s._id,
                mediaUrl: s.mediaUrl,
                mediaType: s.mediaType,
                caption: s.caption || "",
                createdAt: s.createdAt,
                viewsCount: (s.views || []).length,
                viewers: (s.views || []).map((v) => ({
                    _id: v.user?._id || v.user,
                    name: v.user?.name || "User",
                    profileImage: v.user?.profileImage || "",
                    viewedAt: v.viewedAt
                }))
            }));

            // Find mutual matches with String and ObjectId robustness
            const myIdStr = req.userId.toString();
            const myIdObj = mongoose.Types.ObjectId.isValid(req.userId)
                ? new mongoose.Types.ObjectId(req.userId)
                : req.userId;
            const myIdVariants = [myIdStr, myIdObj];

            const myLikes = await Like.find({
                from: { $in: myIdVariants },
                type: "like"
            }).select("to").lean();

            let usersWithStories = [];

            if (myLikes && myLikes.length > 0) {
                const likedIds = myLikes.map((l) => l.to);

                // Find who liked me back
                const mutualLikes = await Like.find({
                    from: { $in: likedIds },
                    to: { $in: myIdVariants },
                    type: "like"
                }).select("from").lean();

                const mutualUserIds = mutualLikes.map((m) => m.from);

                // Check blocks
                const blockedDocs = await Block.find({
                    $or: [
                        { blocker: req.userId, blocked: { $in: mutualUserIds } },
                        { blocker: { $in: mutualUserIds }, blocked: req.userId }
                    ]
                }).lean();

                const blockedSet = new Set();
                blockedDocs.forEach((b) => {
                    blockedSet.add(b.blocker.toString());
                    blockedSet.add(b.blocked.toString());
                });

                const activeMutualIds = mutualUserIds.filter(
                    (id) => !blockedSet.has(id.toString())
                );

                if (activeMutualIds.length > 0) {
                    // Fetch all active stories from mutual matches
                    const matchStories = await Story.find({
                        user: { $in: activeMutualIds },
                        expiresAt: { $gt: now }
                    })
                        .sort({ createdAt: 1 })
                        .populate("user", "_id name profileImage photos isActive lastSeen")
                        .lean();

                    // Group stories by user
                    const userMap = new Map();

                    matchStories.forEach((st) => {
                        if (!st.user || st.user.isActive === false) return;
                        const uid = st.user._id.toString();

                        if (!userMap.has(uid)) {
                            userMap.set(uid, {
                                user: {
                                    _id: st.user._id,
                                    name: st.user.name,
                                    profileImage: st.user.profileImage || (st.user.photos && st.user.photos[0]) || "",
                                    isActive: st.user.isActive,
                                    lastSeen: st.user.lastSeen
                                },
                                stories: [],
                                hasUnviewed: false,
                                latestCreatedAt: st.createdAt
                            });
                        }

                        const group = userMap.get(uid);
                        const isViewed = (st.views || []).some(
                            (v) => (v.user?._id || v.user)?.toString() === currentUserId
                        );

                        if (!isViewed) {
                            group.hasUnviewed = true;
                        }

                        if (new Date(st.createdAt) > new Date(group.latestCreatedAt)) {
                            group.latestCreatedAt = st.createdAt;
                        }

                        group.stories.push({
                            _id: st._id,
                            mediaUrl: st.mediaUrl,
                            mediaType: st.mediaType,
                            caption: st.caption || "",
                            createdAt: st.createdAt,
                            isViewed,
                            viewsCount: (st.views || []).length
                        });
                    });

                    usersWithStories = Array.from(userMap.values());

                    // Sort: Users with unviewed stories FIRST, then newest story timestamp
                    usersWithStories.sort((a, b) => {
                        if (a.hasUnviewed !== b.hasUnviewed) {
                            return a.hasUnviewed ? -1 : 1;
                        }
                        return new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt);
                    });
                }
            }

            const storiesByUserId = {};
            usersWithStories.forEach((g) => {
                if (g.user?._id) storiesByUserId[g.user._id.toString()] = g.stories || [];
            });

            res.json({
                success: true,
                myUser: {
                    _id: myUser?._id || req.userId,
                    name: myUser?.name || "You",
                    profileImage: myUser?.profileImage || (myUser?.photos && myUser.photos[0]) || ""
                },
                myStories,
                hasMyStories: myStories.length > 0,
                userStories: usersWithStories,
                storiesByUserId
            });
        } catch (error) {
            console.error("[Stories] Tray fetch error:", error);
            res.status(500).json({ success: false, message: "Could not load stories" });
        }
    });

    // ==================================================
    // 2. CREATE STORY (Multipart or Base64 Image/Video)
    // ==================================================
    router.post(
        "/",
        authMiddleware,
        upload.fields([{ name: "media", maxCount: 1 }, { name: "photo", maxCount: 1 }]),
        async (req, res) => {
            try {
                const bucket = getStoryBucket();
                if (!bucket) {
                    return res.status(503).json({ success: false, message: "Story storage is unavailable" });
                }

                let buffer = null;
                let mimetype = "image/jpeg";
                let mediaType = "image";
                let originalFilename = "story.jpg";

                const file = req.files?.media?.[0] || req.files?.photo?.[0];
                if (file) {
                    buffer = file.buffer;
                    mimetype = file.mimetype;
                    mediaType = file.mimetype.startsWith("video/") ? "video" : "image";
                    originalFilename = file.originalname || "story";
                } else if (req.body.mediaData) {
                    // Base64 format: data:image/png;base64,xxxx
                    const matches = req.body.mediaData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        mimetype = matches[1];
                        mediaType = mimetype.startsWith("video/") ? "video" : "image";
                        buffer = Buffer.from(matches[2], "base64");
                        originalFilename = `story_${Date.now()}.${mimetype.split("/")[1] || "jpg"}`;
                    }
                }

                if (!buffer || buffer.length === 0) {
                    return res.status(400).json({ success: false, message: "No photo or video was provided" });
                }

                if (buffer.length > 10 * 1024 * 1024) {
                    return res.status(413).json({ success: false, message: "Story media must be under 10MB" });
                }

                const filename = `story-${req.userId}-${Date.now()}${path.extname(originalFilename).toLowerCase() || ".jpg"}`;

                const uploadStream = bucket.openUploadStream(filename, {
                    contentType: mimetype,
                    metadata: {
                        userId: req.userId.toString(),
                        mediaType
                    }
                });

                await new Promise((resolve, reject) => {
                    uploadStream.on("finish", resolve);
                    uploadStream.on("error", reject);
                    uploadStream.end(buffer);
                });

                const mediaFileId = uploadStream.id;
                const mediaUrl = `/api/stories/media/${mediaFileId}`;

                // Story expires strictly in 24 hours
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

                const newStory = await Story.create({
                    user: req.userId,
                    mediaUrl,
                    mediaFileId,
                    mediaType,
                    caption: (req.body.caption || "").slice(0, 300).trim(),
                    expiresAt,
                    views: []
                });

                const populatedStory = await Story.findById(newStory._id)
                    .populate("user", "_id name profileImage photos")
                    .lean();

                // Notify mutual matches over Socket.IO if online
                try {
                    const mutuals = await Like.find({
                        from: req.userId,
                        type: "like"
                    }).select("to").lean();

                    if (mutuals.length > 0) {
                        const likedIds = mutuals.map((l) => l.to);
                        const matchLikes = await Like.find({
                            from: { $in: likedIds },
                            to: req.userId,
                            type: "like"
                        }).select("from").lean();

                        matchLikes.forEach((ml) => {
                            io.to(ml.from.toString()).emit("newStoryAvailable", {
                                user: {
                                    _id: populatedStory.user._id,
                                    name: populatedStory.user.name,
                                    profileImage: populatedStory.user.profileImage
                                },
                                storyId: populatedStory._id
                            });
                        });
                    }
                } catch (socketErr) {
                    console.warn("[Stories] Realtime broadcast error:", socketErr);
                }

                res.status(201).json({
                    success: true,
                    message: "Story shared successfully! 🌟",
                    story: populatedStory
                });
            } catch (error) {
                console.error("[Stories] Create error:", error);
                res.status(500).json({ success: false, message: error.message || "Failed to post story" });
            }
        }
    );

    // ==================================================
    // 3. STREAM STORY MEDIA (GridFS with HTTP caching)
    // ==================================================
    router.get("/media/:fileId", async (req, res) => {
        try {
            const { fileId } = req.params;
            if (!mongoose.Types.ObjectId.isValid(fileId)) {
                return res.status(400).send("Invalid file ID");
            }

            const bucket = getStoryBucket();
            if (!bucket) {
                return res.status(503).send("Storage unavailable");
            }

            const objectId = new mongoose.Types.ObjectId(fileId);
            const files = await bucket.find({ _id: objectId }).toArray();
            if (!files || files.length === 0) {
                return res.status(404).send("Story media not found");
            }

            const file = files[0];
            res.set("Content-Type", file.contentType || "image/jpeg");
            res.set("Cache-Control", "public, max-age=86400, immutable");

            const downloadStream = bucket.openDownloadStream(objectId);
            downloadStream.on("error", (err) => {
                if (!res.headersSent) res.status(404).send("Error streaming media");
            });

            downloadStream.pipe(res);
        } catch (error) {
            console.error("[Stories] Media streaming error:", error);
            if (!res.headersSent) res.status(500).send("Server error");
        }
    });

    // ==================================================
    // 4. MARK STORY AS VIEWED
    // ==================================================
    router.post("/:id/view", authMiddleware, async (req, res) => {
        try {
            const storyId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(storyId)) {
                return res.status(400).json({ success: false, message: "Invalid story ID" });
            }

            const story = await Story.findById(storyId);
            if (!story) {
                return res.status(404).json({ success: false, message: "Story not found or expired" });
            }

            // Do not record self views
            if (story.user.toString() === req.userId.toString()) {
                return res.json({ success: true, message: "Self view" });
            }

            const alreadyViewed = story.views.some(
                (v) => v.user.toString() === req.userId.toString()
            );

            if (!alreadyViewed) {
                story.views.push({
                    user: req.userId,
                    viewedAt: new Date()
                });
                await story.save();

                // Optionally notify story owner of the view in realtime
                io.to(story.user.toString()).emit("storyViewed", {
                    storyId: story._id,
                    viewerId: req.userId
                });
            }

            res.json({ success: true, viewsCount: story.views.length });
        } catch (error) {
            console.error("[Stories] View error:", error);
            res.status(500).json({ success: false, message: "Could not record view" });
        }
    });

    // ==================================================
    // 5. REPLY / REACT TO STORY (Sends to Match's Chat)
    // ==================================================
    router.post("/:id/reply", authMiddleware, async (req, res) => {
        try {
            const storyId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(storyId)) {
                return res.status(400).json({ success: false, message: "Invalid story ID" });
            }

            const story = await Story.findById(storyId).populate("user", "name profileImage isActive").lean();
            if (!story) {
                return res.status(404).json({ success: false, message: "Story not found or has expired" });
            }

            const targetUserId = story.user._id.toString();
            if (targetUserId === req.userId.toString()) {
                return res.status(400).json({ success: false, message: "Cannot reply to your own story" });
            }

            // Verify mutual match or not blocked
            const isBlocked = await Block.exists({
                $or: [
                    { blocker: req.userId, blocked: story.user._id },
                    { blocker: story.user._id, blocked: req.userId }
                ]
            });
            if (isBlocked) {
                return res.status(403).json({ success: false, message: "You cannot message this user" });
            }

            const senderUser = await User.findById(req.userId).select("name profileImage").lean();
            if (!senderUser) {
                return res.status(404).json({ success: false, message: "Sender not found" });
            }

            const reaction = (req.body.reaction || "").trim();
            const text = (req.body.text || req.body.message || "").trim();

            if (!reaction && !text) {
                return res.status(400).json({ success: false, message: "Please provide a reaction or message" });
            }

            // Format message content
            let contentText = "";
            if (reaction && text) {
                contentText = `${reaction} ${text}`;
            } else if (reaction) {
                contentText = `${reaction} Reacted to your story`;
            } else {
                contentText = text;
            }

            // Create message with replyTo reference to the story
            const replySnippet = story.caption ? `Story: "${story.caption}"` : "Story 📸";
            const message = await Message.create({
                sender: req.userId,
                receiver: story.user._id,
                content: contentText,
                type: "text",
                replyTo: {
                    messageId: null,
                    text: replySnippet,
                    senderName: story.user.name || "Story"
                },
                isViewed: false
            });

            // Create in-app notification
            const notification = await Notification.create({
                recipient: story.user._id,
                sender: req.userId,
                type: "message",
                title: `${senderUser.name} replied to your story`,
                message: contentText
            });

            // Realtime Socket.IO emission
            io.to(targetUserId).emit("newMessage", message);
            io.to(targetUserId).emit("newNotification", notification);

            // Push Notification
            sendPushNotification(targetUserId, {
                title: `${senderUser.name} 💬`,
                body: `Replied to your story: ${contentText}`,
                icon: senderUser.profileImage || "/images/icons/icon-192.png",
                url: `/chat.html?user=${req.userId}`
            }).catch(() => {});

            res.json({
                success: true,
                message: "Reply sent! 💬",
                chatMessage: message
            });
        } catch (error) {
            console.error("[Stories] Reply error:", error);
            res.status(500).json({ success: false, message: "Could not send reply" });
        }
    });

    // ==================================================
    // 5.5 GET STORY VIEWERS (for own stories)
    // ==================================================
    router.get("/:id/viewers", authMiddleware, async (req, res) => {
        try {
            const storyId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(storyId)) {
                return res.status(400).json({ success: false, message: "Invalid story ID" });
            }

            const story = await Story.findOne({
                _id: storyId,
                user: req.userId
            })
                .populate("views.user", "_id name profileImage")
                .lean();

            if (!story) {
                return res.status(404).json({ success: false, message: "Story not found" });
            }

            const viewers = (story.views || []).map((v) => ({
                _id: v.user?._id || v.user,
                name: v.user?.name || "User",
                profileImage: v.user?.profileImage || "",
                viewedAt: v.viewedAt
            }));

            res.json({
                success: true,
                viewsCount: viewers.length,
                viewers
            });
        } catch (error) {
            console.error("[Stories] Fetch viewers error:", error);
            res.status(500).json({ success: false, message: "Failed to fetch viewers" });
        }
    });

    // ==================================================
    // 6. DELETE OWN STORY
    // ==================================================
    router.delete("/:id", authMiddleware, async (req, res) => {
        try {
            const storyId = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(storyId)) {
                return res.status(400).json({ success: false, message: "Invalid story ID" });
            }

            const story = await Story.findById(storyId);
            if (!story) {
                return res.status(404).json({ success: false, message: "Story not found" });
            }

            if (story.user.toString() !== req.userId.toString()) {
                return res.status(403).json({ success: false, message: "Not authorized to delete this story" });
            }

            // Remove file from GridFS
            if (story.mediaFileId) {
                const bucket = getStoryBucket();
                if (bucket) {
                    try {
                        await bucket.delete(new mongoose.Types.ObjectId(story.mediaFileId));
                    } catch (bucketErr) {
                        console.warn("[Stories] GridFS file deletion warning:", bucketErr.message);
                    }
                }
            }

            await Story.deleteOne({ _id: story._id });

            res.json({ success: true, message: "Story deleted successfully 🗑️" });
        } catch (error) {
            console.error("[Stories] Delete error:", error);
            res.status(500).json({ success: false, message: "Failed to delete story" });
        }
    });

    return router;
};
