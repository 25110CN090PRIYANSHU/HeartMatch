const express = require("express");
const Like = require("../models/Like");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get all matches ordered by recent interaction (Instagram/WhatsApp style)
router.get("/", authMiddleware, async (req, res) => {
    try {
        const myLikes = await Like.find({
            from: req.userId,
            type: "like"
        });

        const matches = [];

        for (const like of myLikes) {
            const mutualLike = await Like.findOne({
                from: like.to,
                to: req.userId,
                type: "like"
            }).populate("from", "-password");

            if (mutualLike && mutualLike.from) {
                const partner = mutualLike.from.toObject();

                // Find the latest message between user and partner
                const lastMsg = await Message.findOne({
                    $or: [
                        { sender: req.userId, receiver: partner._id },
                        { sender: partner._id, receiver: req.userId }
                    ]
                }).sort({ createdAt: -1 });

                // Find unread count from this partner
                const unreadCount = await Message.countDocuments({
                    sender: partner._id,
                    receiver: req.userId,
                    isRead: false
                });

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
                    partner.lastMessageSender = lastMsg.sender.toString() === req.userId.toString() ? "mine" : "theirs";
                } else {
                    partner.lastMessage = "";
                    partner.lastMessageAt = mutualLike.createdAt || like.createdAt;
                    partner.lastMessageSender = "";
                }

                partner.unreadCount = unreadCount;
                matches.push(partner);
            }
        }

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