const mongoose = require("mongoose");

const storySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        mediaUrl: {
            type: String,
            required: true
        },
        mediaFileId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        mediaType: {
            type: String,
            enum: ["image", "video"],
            default: "image"
        },
        caption: {
            type: String,
            default: "",
            maxlength: 300,
            trim: true
        },
        views: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User"
                },
                viewedAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ],
        expiresAt: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: true
    }
);

storySchema.index({ user: 1, expiresAt: -1 });
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Story", storySchema);
