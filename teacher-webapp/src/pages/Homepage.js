import {useConference} from '../context/ConferenceContext';
import {DetailsPage} from '../callPage';
import {TeacherList} from '../components/TeacherList';
import {StudentList} from '../components/StudentList';
import {createConference} from '../services/apiService';
import {teachers, students} from '../state'; // Import teachers and students
import React from 'react';
import '../App.css';
import getCurrentTime from "../utils/CurrentTime";
import {SSE_ENDPOINTS} from "../constants/sseEndpoints";

function Homepage() {
  const {
    selectedTeacher,
    selectedStudents,
    setConfId,
    loading,
    setLoading,
    handleSSEEvent,
    handleTeacherSelect,
    handleStudentToggle,
  } = useConference();
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const handleFormSubmit = async () => {
    setLoading(true); // Start loading
    try {
      const data = await createConference(
        selectedTeacher.phone_number,
        selectedStudents.map((item) => item.phone_number)
      );
      const conferenceId = data.id;
      setConfId(conferenceId);
      console.log('Conf ID:', conferenceId);
      const sseEp = SSE_ENDPOINTS.CONFERENCE.TEACHER_CONNECT(conferenceId);
      const eventSource = new EventSource(sseEp);
      eventSource.onmessage = (event) => {
        console.log(`${getCurrentTime()} Message from SSE:`, event.data);
        const parsedData = JSON.parse(event.data);
        handleSSEEvent(parsedData);
      };
      eventSource.onerror = (err) => {
        console.error("SSE Error:", err);
        eventSource.close();
      };
      setIsSubmitted(true); // Navigate to DetailsPage
    } catch (error) {
      console.error('Error in API call:', error);
    } finally {
      setLoading(false); // Stop loading
    }
  };
  if (isSubmitted) {
    return <DetailsPage/>;
  }
  return (
    <div className="app-container">
      <h1 className="welcome-title">Welcome</h1>
      <div className="list-container">
        <TeacherList
          teachers={teachers}
          selectedTeacher={selectedTeacher}
          onTeacherSelect={handleTeacherSelect}
        />
        <StudentList
          students={students}
          selectedStudents={selectedStudents}
          onStudentToggle={handleStudentToggle}
        />
      </div>
      <button
        className="start-conference-button"
        onClick={handleFormSubmit}
        disabled={
          !selectedTeacher || selectedStudents.length === 0 || loading
        }
      >
        {loading ? 'Starting Conference...' : 'Start Conference'}
      </button>
    </div>
  );
}

export default Homepage;
