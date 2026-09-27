const User = require("../models/User");
const auth = require("./authMiddleware");
module.exports = [auth, async (req,res,next)=>{ const user=await User.findById(req.userId).select("isAdmin"); if(!user || !user.isAdmin) return res.status(403).json({message:"Admin access required"}); next(); }];
