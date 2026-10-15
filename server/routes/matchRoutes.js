const express = require("express");
const Like = require("../models/Like");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get all matches ordered by recent interaction (Instagram/WhatsApp style) - Optimized Batch Execution
router.get("/", authMiddleware, async (req, res) => {
    try {
        // Step 1: Find all user IDs I liked
        const myLikes = await Like.find({
            from: req.userId,
            type: "like"
        }).select("to createdAt").lean();

        if (!myLikes || !myLikes.length) {
            return res.json({
                message: "Matches fetched successfully ❤️",
                matches: []
            });
        }

        const myLikedIds = myLikes.map(l => l.to);
        const myLikeDateMap = new Map(myLikes.map(l => [String(l.to), l.createdAt]));

        // Step 2: In ONE single query, find all users who liked me back
        const mutualLikes = await Like.find({
            from: { $in: myLikedIds },
            to: req.userId,
            type: "like"
        }).populate("from", "name age gender bio location profileImage isVerified lastSeen isActive").lean();

        if (!mutualLikes || !mutualLikes.length) {
            return res.json({
                message: "Matches fetched successfully ❤️",
                matches: []
            });
        }

        // Step 3: Fetch last messages and unread counts concurrently in parallel
        const matches = await Promise.all(
            mutualLikes
                .filter(m => m.from && m.from.isActive !== false)
                .map(async (mutualLike) => {
                    const partner = { ...mutualLike.from };
                    const partnerId = partner._id;

                    const [lastMsg, unreadCount] = await Promise.all([
                        Message.findOne({
                            $or: [
                                { sender: req.userId, receiver: partnerId },
                                { sender: partnerId, receiver: req.userId }
                            ]
                        }).sort({ createdAt: -1 }).select("content type createdAt sender viewOnce").lean(),

                        Message.countDocuments({
                            sender: partnerId,
                            receiver: req.userId,
                            read: false
                        })
                    ]);

                    if (lastMsg) {
                        let preview = lastMsg.content;
                        if (lastMsg.type === "image") preview = "📷 Photo";
                        else if (lastMsg.type === "video") preview = "🎥 Video";
                        else if (lastMsg.type === "audio") preview = "🎙️ Voice note";
                        else if (lastMsg.type === "view_once" || lastMsg.viewOnce) preview = "👁️ View once photo";
                        else if (typeof preview === "string" && preview.startsWith("__HM_ATTACHMENT__")) preview = "📎 Attachment";
                        else if (typeof preview === "string" && preview.startsWith("__HM_VIEW_ONCE__")) preview = "👁️ View once photo";

                        partner.lastMessage = preview;
                        partner.lastMessageAt = lastMsg.createdAt;
                        partner.lastMessageSender = String(lastMsg.sender) === String(req.userId) ? "mine" : "theirs";
                    } else {
                        partner.lastMessage = "";
                        partner.lastMessageAt = mutualLike.createdAt || myLikeDateMap.get(String(partnerId)) || new Date();
                        partner.lastMessageSender = "";
                    }

                    partner.unreadCount = unreadCount;
                    return partner;
                })
        );

        // Sort descending: person with recent message or recent match comes FIRST (Instagram style)
        matches.sort((a, b) => {
            const timeA = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        res.json({
            message: "Matches fetched successfully ❤️",
            matches
        });

    } catch (error) {
        console.error("Match route error:", error);
        res.status(500).json({
            message: "Server error"
        });
    }
});

module.exports = router;