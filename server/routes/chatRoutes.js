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

        const requestedUserId = String(req.params.userId || "").trim();
        let otherUser;

        // Chat links may contain either the MongoDB _id or the user's public
        // HeartMatch User ID. Resolve the public ID to the real _id first.
        const userFields = "name age gender bio profileImage isVerified lastSeen isActive";
        if (mongoose.Types.ObjectId.isValid(requestedUserId)) {
            otherUser = await User.findById(requestedUserId).select(userFields).lean();
        } else {
            otherUser = await User.findOne({ userId: requestedUserId.toLowerCase(), isActive: true }).select(userFields).lean();
        }

        if (!otherUser) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const otherUserId = otherUser._id.toString();

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

        // Get conversation and user settings concurrently
        const [messages, me] = await Promise.all([
            Message.find({
                $or: [
                    { sender: req.userId, receiver: otherUserId },
                    { sender: otherUserId, receiver: req.userId }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean()
            .then(msgs => msgs.reverse()),

            User.findById(req.userId).select("chatBackgrounds").lean()
        ]);

        // Mark received messages as read asynchronously in background
        Message.updateMany(
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
        ).catch(() => {});

        const background = me?.chatBackgrounds?.[otherUserId] || me?.chatBackgrounds?.get?.(otherUserId) || "";

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

// ==========================================
// 1. ✨ AI WINGMAN (Smart Icebreakers & Banter)
// ==========================================
router.get("/wingman/:userId", authMiddleware, async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const [me, them] = await Promise.all([
            User.findById(req.userId).select("name interests bio anthem loveLanguage socialEnergy lookingFor").lean(),
            User.findById(otherUserId).select("name interests bio anthem loveLanguage socialEnergy lookingFor prompts").lean()
        ]);

        if (!them) {
            return res.status(404).json({ message: "User not found" });
        }

        const name = them.name ? them.name.split(" ")[0] : "there";
        const shared = (me?.interests || []).filter(i => (them.interests || []).map(x => x.toLowerCase()).includes(i.toLowerCase()));
        const topInterest = shared.length > 0 ? shared[0] : (them.interests?.[0] || "");
        const anthem = them.anthem?.title ? `${them.anthem.title}${them.anthem.artist ? " by " + them.anthem.artist : ""}` : "";
        const loveLang = them.loveLanguage ? them.loveLanguage.replace(/[^a-zA-Z\s]/g, "").trim() : "";

        const suggestions = [];

        // 1. Witty / Flirty Opener
        if (anthem) {
            suggestions.push({
                category: "🎵 Anthem Opener",
                badge: "Music Chemistry",
                text: `I noticed your anthem is "${them.anthem.title}" — impeccable taste! What's the song that never fails to put you in a good mood?`
            });
        } else if (topInterest) {
            suggestions.push({
                category: "🔥 Witty & Flirty",
                badge: "High Chemistry",
                text: `I saw we both love ${topInterest}! Settle a debate for me: what's the one thing most people get wrong about it?`
            });
        } else {
            suggestions.push({
                category: "🔥 Witty & Flirty",
                badge: "Fun & Playful",
                text: `Hey ${name}! Two truths and a lie — pick your favorite: I make the best coffee in town, I've binge-watched an entire series in 24 hours, or I'm terrible at small talk 😉`
            });
        }

        // 2. Casual & Playful
        if (loveLang) {
            suggestions.push({
                category: "☕ Casual & Smooth",
                badge: "Love Language",
                text: `Your love language is ${loveLang} — so basically an iced latte and genuine vibes? Tell me what your ideal Saturday morning looks like!`
            });
        } else if (them.bio && them.bio.length > 10) {
            const bioWords = them.bio.slice(0, 45);
            suggestions.push({
                category: "☕ Casual & Smooth",
                badge: "Bio Cue",
                text: `Your bio caught my eye! How did your week start off, ${name}?`
            });
        } else {
            suggestions.push({
                category: "☕ Casual & Smooth",
                badge: "Low Pressure",
                text: `Hey ${name}, quick question: if you could teleport anywhere in the world right now for dinner, where are we going? ✈️`
            });
        }

        // 3. Deep Chemistry & Banter
        suggestions.push({
            category: "💫 Deep & Intriguing",
            badge: "Deep Vibe",
            text: `Skip the small talk: what's a random passion or hobby you could talk about for 2 hours straight without stopping? 🌟`
        });

        // 4. Meetup / Date Transition
        suggestions.push({
            category: "☕ Meetup Spark",
            badge: "Date Transition",
            text: `Texting is fun, but great coffee and good conversation are undefeated. What's your go-to spot in the city? ☕`
        });

        res.json({
            success: true,
            recipientName: name,
            suggestions
        });

    } catch (e) {
        console.error("AI Wingman error:", e);
        res.status(500).json({ message: "Failed to generate suggestions" });
    }
});

// ==========================================
// 2. ☕ IN-CHAT DATE PLANNER ("Meet-in-the-Middle")
// ==========================================
router.post("/date-invite", authMiddleware, async (req, res) => {
    try {
        const { receiverId, activity, dateTime, locationName } = req.body;
        if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ message: "Invalid receiver ID" });
        }
        if (!activity || !dateTime || !locationName) {
            return res.status(400).json({ message: "Please provide activity, date/time, and location." });
        }

        const dateDetails = {
            activity: String(activity).trim(),
            dateTime: String(dateTime).trim(),
            locationName: String(locationName).trim(),
            status: "pending"
        };

        const content = `☕ Date Invitation: ${dateDetails.activity} at ${dateDetails.locationName} (${dateDetails.dateTime})`;

        const message = await Message.create({
            sender: req.userId,
            receiver: receiverId,
            content,
            type: "date_invite",
            dateDetails
        });

        res.status(201).json({
            success: true,
            message
        });

    } catch (e) {
        console.error("Date invite creation error:", e);
        res.status(500).json({ message: "Could not create date invitation" });
    }
});

router.put("/date-invite/:messageId", authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body;
        if (!["accepted", "declined"].includes(status)) {
            return res.status(400).json({ message: "Status must be 'accepted' or 'declined'" });
        }

        const msg = await Message.findById(messageId);
        if (!msg || msg.type !== "date_invite") {
            return res.status(404).json({ message: "Date invite not found" });
        }

        // Only receiver can accept/decline
        if (msg.receiver.toString() !== req.userId.toString()) {
            return res.status(403).json({ message: "Only the recipient can respond to this date invitation" });
        }

        msg.dateDetails = msg.dateDetails || {};
        msg.dateDetails.status = status;
        await msg.save();

        res.json({
            success: true,
            status,
            message: msg
        });

    } catch (e) {
        console.error("Date invite update error:", e);
        res.status(500).json({ message: "Could not update date invitation" });
    }
});

// ==========================================
// 3. 💖 POLITE CLOSURE & KARMA UNMATCH
// ==========================================
router.post("/polite-unmatch", authMiddleware, async (req, res) => {
    try {
        const { otherUserId, closureNote } = req.body;
        if (!otherUserId || !mongoose.Types.ObjectId.isValid(otherUserId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const note = typeof closureNote === "string" && closureNote.trim().length > 0
            ? closureNote.trim()
            : "Hey, it was lovely chatting, but I don't feel a romantic spark. Wishing you the best on your journey! ✨";

        // 1. Send polite closure message
        await Message.create({
            sender: req.userId,
            receiver: otherUserId,
            content: `💖 Polite Closure: ${note}`,
            type: "text"
        });

        // 2. Remove likes to unmatch
        await Like.deleteMany({
            $or: [
                { from: req.userId, to: otherUserId },
                { from: otherUserId, to: req.userId }
            ]
        });

        // 3. Reward user with +10 Karma Respect Points
        const user = await User.findById(req.userId);
        if (user) {
            user.respectScore = (user.respectScore || 100) + 10;
            if (!user.respectBadges) user.respectBadges = [];
            if (!user.respectBadges.includes("🤝 Verified Respectful")) {
                user.respectBadges.push("🤝 Verified Respectful");
            }
            await user.save();
        }

        res.json({
            success: true,
            message: "Unmatched politely. +10 Respect Karma awarded! 💖",
            respectScore: user?.respectScore || 110
        });

    } catch (e) {
        console.error("Polite unmatch error:", e);
        res.status(500).json({ message: "Could not process unmatch" });
    }
});

module.exports = router;
