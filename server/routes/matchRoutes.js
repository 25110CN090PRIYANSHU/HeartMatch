const express = require("express");
const Like = require("../models/Like");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get all matches
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

            if (mutualLike) {
                matches.push(mutualLike.from);
            }
        }

        res.json({
            message: "Matches fetched successfully ❤️",
            matches
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

module.exports = router;