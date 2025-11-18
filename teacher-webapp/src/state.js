// Define a Participant class
import contactsData from "./contacts.json";
export class Participant {
  constructor({
    name = "Unknown",
    phoneNumber = "0000000000",
    role = "Student",
    raised_at = -1,
    is_raised = false,
    is_muted = true,
    call_status = "disconnected",
  } = {}) {
    // Destructure object and provide default values
    this.name = name;
    this.phoneNumber = phoneNumber;
    this.role = role;
    this.raised_at = raised_at;
    this.is_raised = is_raised;
    this.is_muted = is_muted;
    this.call_status = call_status;
  }
}

export class AudioContentState {
  constructor({
    current_url = "",
    status = "Paused",
    paused_at = "",
    position_seconds = null,
  } = {}) {
    this.current_url = current_url;
    this.status = status;
    this.paused_at = paused_at;
    this.position_seconds = position_seconds;
  }
}

// // Sample data for teachers and students
// export const teachers = contactsData.teachers.map(
//   (data) => new Participant(data)
// );

// export const students = contactsData.students.map(
//   (data) => new Participant(data)
// );
