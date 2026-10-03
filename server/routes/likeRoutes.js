const express = require("express");
const mongoose = require("mongoose");

const Like = require("../models/Like");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Block = require("../models/Block");

const authMiddleware = require("../middleware/authMiddleware");

module.exports = (io) => {

    const router = express.Router();

    // Relationship status for the profile viewer. This lets the UI show
    // "Like Back" when the other user has already liked the current user.
    router.get("/status/:userId", authMiddleware, async (req, res) => {
        try {
            const { userId } = req.params;
            if (!mongoose.Types.ObjectId.isValid(userId) || userId === req.userId.toString()) {
                return res.status(400).json({ message: "Invalid user ID" });
            }

            const [outgoing, incoming] = await Promise.all([
                Like.findOne({ from: req.userId, to: userId }).select("type").lean(),
                Like.findOne({ from: userId, to: req.userId }).select("type").lean()
            ]);

            return res.json({
                outgoing: outgoing?.type || null,
                incoming: incoming?.type || null,
                canLikeBack: incoming?.type === "like" && outgoing?.type !== "like"
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Server error" });
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

            // Only check match for LIKE
            if (type === "like") {

                // Notify the target user that they were liked. Do not reveal
                // an email or any private field, and do not create duplicates.
                const mutualLike = await Like.findOne({
                    from: to,
                    to: req.userId,
                    type: "like"
                });

                if (!mutualLike) {
                    const existingLikeNotification = await Notification.findOne({
                        recipient: to,
                        sender: req.userId,
                        type: "like"
                    });

                    if (!existingLikeNotification) {
                        const currentUser = await User.findById(req.userId).select("name").lean();
                        const likeNotification = await Notification.create({
                            recipient: to,
                            sender: req.userId,
                            type: "like",
                            title: "Someone liked you ❤️",
                            message: `${currentUser?.name || "Someone"} liked your profile. View their profile to like back.`
                        });

                        io.to(to.toString()).emit("newNotification", likeNotification);
                    }
                }

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

    return router;

};