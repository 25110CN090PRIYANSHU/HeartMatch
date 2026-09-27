const express = require("express");
const mongoose = require("mongoose");

const Like = require("../models/Like");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Block = require("../models/Block");

const authMiddleware = require("../middleware/authMiddleware");

module.exports = (io) => {

    const router = express.Router();

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