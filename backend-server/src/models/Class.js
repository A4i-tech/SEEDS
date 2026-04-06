"use strict";
const mongoose = require("mongoose");

const ClassRoomSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, index: true, ref: "School" },
  name: { type: String, required: true },
  teacher: { type: String, required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  leaders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  contentIds: [String],
}, { timestamps: true });


const ClassRoom = (module.exports = mongoose.model("Class", ClassRoomSchema));

module.exports = ClassRoom;

module.exports.getClassById = (_id) => {
  return ClassRoom.findById(_id)
    .populate("students", "name phoneNumber")
    .populate("leaders", "name phoneNumber")
    .exec();
};

module.exports.getClassesByTeacherId = (teacher) => {
  return ClassRoom.find({ teacher })
    .populate("students", "name phoneNumber")
    .populate("leaders", "name phoneNumber")
    .exec();
};

module.exports.deleteClassById = (id) => {
  return ClassRoom.findByIdAndDelete(id).exec();
};
