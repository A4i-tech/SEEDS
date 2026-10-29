// @ts-check
const { uniqueClassroomName } = require('./instances');
const { ClassroomListPage } = require('../pages/ClassroomListPage');
const { ClassroomFormPage } = require('../pages/ClassroomFormPage');

async function createClassroomWithStudents(page, count) {
  const classroomListPage = new ClassroomListPage(page);
  const classroomFormPage = new ClassroomFormPage(page);
  const name = uniqueClassroomName();

  await classroomListPage.goto();
  await classroomListPage.openCreate();
  await classroomFormPage.fillName(name);

  const studentNames = [];
  for (let i = 0; i < count; i++) {
    const label = await classroomFormPage.addFirstAvailableStudent();
    if (!label) break;
    studentNames.push(label.split(' - ')[0]);
  }

  await classroomFormPage.submit();
  await classroomListPage.heading.waitFor();
  return { name, studentNames };
}

module.exports = { createClassroomWithStudents };
