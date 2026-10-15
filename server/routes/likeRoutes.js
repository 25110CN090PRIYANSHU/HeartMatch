const express = require("express");
const mongoose = require("mongoose");

const Like = require("../models/Like");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Block = require("../models/Block");

const authMiddleware = require("../middleware/authMiddleware");
const { sendPushNotification } = require("../utils/pushNotifier");

module.exports = (io) => {

    const router = express.Router();

    // Return relationship state so the profile can show "Like Back".
    router.get("/status/:to", authMiddleware, async (req, res) => {
        try {
            const to = String(req.params.to || "");
            if (!mongoose.Types.ObjectId.isValid(to)) {
                return res.status(400).json({ message: "Invalid user ID" });
            }
            if (to === req.userId.toString()) {
                return res.status(400).json({ message: "Invalid target user" });
            }
            const [mine, theirs] = await Promise.all([
                Like.findOne({ from: req.userId, to, type: "like" }).select("_id"),
                Like.findOne({ from: to, to: req.userId, type: "like" }).select("_id")
            ]);
            res.json({
                likedByMe: !!mine,
                likedMe: !!theirs,
                canLikeBack: !!theirs && !mine
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error" });
        }
    });

    // Return users who liked me (Who Liked You / Secret Admirers)
    router.get("/received", authMiddleware, async (req, res) => {
        try {
            const incomingLikes = await Like.find({ to: req.userId, type: "like" }).select("from createdAt");
            const senderIds = incomingLikes.map(l => l.from);

            const myActions = await Like.find({ from: req.userId, to: { $in: senderIds } }).select("to");
            const alreadyActedSet = new Set(myActions.map(a => String(a.to)));

            const blocks = await Block.find({
                $or: [{ blocker: req.userId }, { blocked: req.userId }]
            }).select("blocker blocked");
            const blockedSet = new Set();
            blocks.forEach(b => {
                blockedSet.add(String(b.blocker));
                blockedSet.add(String(b.blocked));
            });

            const pendingSenderIds = senderIds.filter(id => !alreadyActedSet.has(String(id)) && !blockedSet.has(String(id)));

            const likers = await User.find({
                _id: { $in: pendingSenderIds },
                isActive: { $ne: false }
            }).select("-password");

            res.json({
                message: "Received likes fetched successfully ❤️",
                likers,
                count: likers.length
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server error" });
        }
    });

    router.post("/", authMiddleware, async (req, res) => {

        try {

            const { to, type } = req.body;

            // Validate request
            if (!to || !mongoose.Types.ObjectId.isValid(to) || !["like", "pass"].includes(type)) {

                return res.status(400).json({
                    message: "Invalid request"
                });

            }

            // Prevent self-like
            if (to === req.userId.toString()) {

                return res.status(400).json({
                    message: "You cannot like yourself"
                });

            }

            // Check target user
            const targetUser = await User.findById(to);

            if (!targetUser) {

                return res.status(404).json({
                    message: "User not found"
                });

            }

            const blocked = await Block.exists({
                $or: [
                    { blocker: req.userId, blocked: to },
                    { blocker: to, blocked: req.userId }
                ]
            });
            if (blocked) {
                return res.status(403).json({
                    message: "This user is unavailable"
                });
            }

            // Save like/pass
            const result = await Like.findOneAndUpdate(

                {
                    from: req.userId,
                    to: to
                },

                {
                    from: req.userId,
                    to: to,
                    type: type
                },

                {
                    upsert: true,
                    new: true
                }

            );

            // Notify the recipient on a new LIKE (not on pass, and not repeatedly).
            if (type === "like") {
                const existingLikeNotification = await Notification.findOne({
                    recipient: to,
                    sender: req.userId,
                    type: "like"
                });
                if (!existingLikeNotification) {
                    const liker = await User.findById(req.userId).select("name");
                    const likeNotification = await Notification.create({
                        recipient: to,
                        sender: req.userId,
                        type: "like",
                        title: "Someone liked you ❤️",
                        message: `${liker?.name || "Someone"} liked your profile. View their profile to like back.`
                    });
                    io.to(to.toString()).emit("newNotification", likeNotification);

                    sendPushNotification(to, {
                        title: "Someone liked you ❤️",
                        body: `${liker?.name || "Someone"} liked your profile on HeartMatch!`,
                        url: "/matches.html"
                    }).catch(() => {});
                }
            }

            // Only check match for LIKE
            if (type === "like") {

                const mutualLike = await Like.findOne({

                    from: to,
                    to: req.userId,
                    type: "like"

                });

                // MATCH FOUND ❤️
                if (mutualLike) {

                    // Get current user
                    const currentUser =
                        await User.findById(req.userId);

                    /*
                    =====================================
                    NOTIFICATION FOR TARGET USER
                    =====================================
                    */

                    const existingTargetNotification =
                        await Notification.findOne({

                            recipient: to,
                            sender: req.userId,
                            type: "match"

                        });

                    if (!existingTargetNotification) {

                        const targetNotification =
                            await Notification.create({

                                recipient: to,

                                sender: req.userId,

                                type: "match",

                                title: "It's a match! 💕",

                                message:
                                    `You and ${currentUser.name} liked each other.`

                            });

                        // Real-time notification
                        io.to(to.toString()).emit(
                            "newNotification",
                            targetNotification
                        );

                    }

                    /*
                    =====================================
                    NOTIFICATION FOR CURRENT USER
                    =====================================
                    */

                    const existingCurrentNotification =
                        await Notification.findOne({

                            recipient: req.userId,
                            sender: to,
                            type: "match"

                        });

                    if (!existingCurrentNotification) {

                        const currentNotification =
                            await Notification.create({

                                recipient: req.userId,

                                sender: to,

                                type: "match",

                                title: "It's a match! 💕",

                                message:
                                    `You and ${targetUser.name} liked each other.`

                            });

                        // Real-time notification
                        io.to(req.userId.toString()).emit(
                            "newNotification",
                            currentNotification
                        );

                    }

                    // Push notifications to lock screens for both users
                    sendPushNotification(to, {
                        title: "It's a Match! 💕",
                        body: `You and ${currentUser.name} liked each other! Start chatting now.`,
                        url: `/chat.html?user=${req.userId}`
                    }).catch(() => {});

                    sendPushNotification(req.userId, {
                        title: "It's a Match! 💕",
                        body: `You and ${targetUser.name} liked each other! Start chatting now.`,
                        url: `/chat.html?user=${to}`
                    }).catch(() => {});

                    return res.json({

                        message: "It's a match! ❤️💕",

                        matched: true,

                        result

                    });

                }

            }

            // Normal like/pass response
            res.json({
                message:
                    type === "like"
                        ? "User liked ❤️"
                        : "User passed",
                matched: false,
                result
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Server error"
            });
        }
    });

    // =====================================
    // REWIND / UNDO LAST SWIPE
    // =====================================
    router.post("/undo", authMiddleware, async (req, res) => {
        try {
            const { to } = req.body;
            if (!to || !mongoose.Types.ObjectId.isValid(to)) {
                return res.status(400).json({ message: "Invalid user ID" });
            }

            // Remove the like or pass document
            const deleted = await Like.findOneAndDelete({
                from: req.userId,
                to: to
            });

            if (!deleted) {
                return res.status(404).json({ message: "No swipe found to undo" });
            }

            // Also clean up any pending notifications if it was an unreciprocated like
            if (deleted.type === "like") {
                await Notification.deleteOne({
                    sender: req.userId,
                    recipient: to,
                    type: "like"
                });
            }

            res.json({
                success: true,
                message: "Swipe undone successfully ⏪",
                targetId: to
            });
        } catch (error) {
            console.error("Undo swipe error:", error);
            res.status(500).json({ message: "Could not undo swipe" });
        }
    });

    return router;

};