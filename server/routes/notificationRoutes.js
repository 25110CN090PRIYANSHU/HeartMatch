const express = require("express");
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


// Get my notifications
router.get("/", authMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({
            recipient: req.userId
        })
        .populate("sender", "name profileImage")
        .sort({ createdAt: -1 })
        .limit(50);

        const unreadCount = await Notification.countDocuments({
            recipient: req.userId,
            read: false
        });

        res.json({
            notifications,
            unreadCount
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


// Mark one notification as read
router.put("/:id/read", authMiddleware, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: "Invalid notification ID"
            });
        }

        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                recipient: req.userId
            },
            {
                read: true
            },
            {
                returnDocument: "after"
            }
        );

        if (!notification) {
            return res.status(404).json({
                message: "Notification not found"
            });
        }

        res.json({
            message: "Notification marked as read",
            notification
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


// Delete one of my notifications
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: "Invalid notification ID"
            });
        }

        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            recipient: req.userId
        });

        if (!notification) {
            return res.status(404).json({
                message: "Notification not found"
            });
        }

        return res.json({
            message: "Notification deleted"
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: "Server error"
        });
    }
});


// Mark all notifications as read
router.put("/read-all", authMiddleware, async (req, res) => {
    try {
        await Notification.updateMany(
            {
                recipient: req.userId,
                read: false
            },
            {
                $set: { read: true }
            }
        );

        res.json({
            message: "All notifications marked as read"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


module.exports = router;