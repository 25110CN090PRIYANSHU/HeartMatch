const express = require("express");
const mongoose = require("mongoose");

const Message = require("../models/Message");
const Like = require("../models/Like");
const User = require("../models/User");
const Block = require("../models/Block");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// Get messages with a matched user
router.get("/:userId", authMiddleware, async (req, res) => {

    try {

        const otherUserId = req.params.userId;

        if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
            return res.status(400).json({
                message: "Invalid user ID"
            });
        }

        if (otherUserId === req.userId.toString()) {
            return res.status(400).json({
                message: "You cannot chat with yourself"
            });
        }

        const blocked = await Block.exists({
            $or: [
                { blocker: req.userId, blocked: otherUserId },
                { blocker: otherUserId, blocked: req.userId }
            ]
        });
        if (blocked) {
            return res.status(403).json({
                message: "You cannot chat with this user"
            });
        }

        // Check mutual match
        const [myLike, theirLike] = await Promise.all([

            Like.exists({
                from: req.userId,
                to: otherUserId,
                type: "like"
            }),

            Like.exists({
                from: otherUserId,
                to: req.userId,
                type: "like"
            })

        ]);

        if (!myLike || !theirLike) {
            return res.status(403).json({
                message: "You can only chat with your matches"
            });
        }

        const otherUser = await User.findById(otherUserId)
            .select("-password");

        if (!otherUser) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Get conversation
        const messages = await Message.find({
            $or: [
                {
                    sender: req.userId,
                    receiver: otherUserId
                },
                {
                    sender: otherUserId,
                    receiver: req.userId
                }
            ]
        })
        .sort({ createdAt: 1 });

        // Mark received messages as read
        await Message.updateMany(
            {
                sender: otherUserId,
                receiver: req.userId,
                read: false
            },
            {
                $set: {
                    read: true
                }
            }
        );

        const me = await User.findById(req.userId).select("chatBackgrounds");
        const background = me?.chatBackgrounds?.get(otherUserId) || "";

        res.json({
            message: "Chat fetched successfully ❤️",
            user: otherUser,
            messages,
            background
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error"
        });

    }

});


// Save (or clear) the current user's background for one conversation
const PRESET_BACKGROUND = /^preset:[a-z]{1,20}$/;
const IMAGE_BACKGROUND = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_BACKGROUND_LENGTH = 900000;

router.put("/:userId/background", authMiddleware, async (req, res) => {

    try {

        const otherUserId = req.params.userId;

        if (!mongoose.Types.ObjectId.isValid(otherUserId) || otherUserId === req.userId.toString()) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const background = typeof req.body?.background === "string" ? req.body.background : "";

        const isValid =
            background === "" ||
            PRESET_BACKGROUND.test(background) ||
            (background.length <= MAX_IMAGE_BACKGROUND_LENGTH && IMAGE_BACKGROUND.test(background));

        if (!isValid) {
            return res.status(400).json({ message: "Invalid or too large background" });
        }

        const key = `chatBackgrounds.${otherUserId}`;
        const update = background ? { $set: { [key]: background } } : { $unset: { [key]: "" } };

        await User.updateOne({ _id: req.userId }, update);

        res.json({ message: "Chat background updated", background });

    } catch (error) {

        console.error(error);

        res.status(500).json({ message: "Server error" });

    }

});


module.exports = router;
