const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 6500000
        },

        read: {
            type: Boolean,
            default: false
        },

        type: {
            type: String,
            enum: ["text", "image", "video", "audio", "view_once", "date_invite"],
            default: "text"
        },

        replyTo: {
            messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
            text: { type: String, default: "" },
            senderName: { type: String, default: "" }
        },

        // In-Chat Date Planner ("Meet-in-the-Middle")
        dateDetails: {
            activity: { type: String, default: "" },
            dateTime: { type: String, default: "" },
            locationName: { type: String, default: "" },
            status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" }
        },

        viewOnce: {
            type: Boolean,
            default: false
        },

        isViewed: {
            type: Boolean,
            default: false
        },

        viewedAt: {
            type: Date,
            default: null
        },

        reactions: {
            type: Map,
            of: String,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, read: 1 });

module.exports = mongoose.model("Message", messageSchema);