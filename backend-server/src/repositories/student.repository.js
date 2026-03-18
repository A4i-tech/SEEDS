"use strict";
const studentDao = require("../dao/mongodb/StudentMongoDao");

exports.findByPhones = (phones) => studentDao.findByPhones(phones);

exports.findOneByPhone = (phoneNumber) => studentDao.findOneByPhone(phoneNumber);

exports.findManyByIds = (ids) => studentDao.findByIds(ids);

exports.updateById = (id, data) => studentDao.updateById(id, data);

exports.bulkUpdateNames = (updates) => studentDao.bulkUpdateNames(updates);

exports.insertManySafe = (data) => studentDao.insertMany(data);
