import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import axios from 'axios';
import {API_ENDPOINTS} from "../constants/apiEndpoints";
import {STATUS_CODES} from "../constants/statusCodes";

const Register = () => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [school, setSchool] = useState([]);

  useEffect(() => {
    const fetchSchools = async () => {
      setLoadingSchools(true);
      try {
        const response = await axios.get(`${API_ENDPOINTS.GET_SCHOOLS}`);
        if (response.status === STATUS_CODES.SUCCESS) {
          setSchool(response.data);
        } else {
          console.error("Failed to fetch schools");
        }
      } catch (error) {
        console.error("Error fetching schools:", error);
      } finally {
        setLoadingSchools(false);
      }
    };

    fetchSchools();
  }, []);

  const handleRegister = async () => {

    if (!phoneNumber || !password || !schoolName) {
      setError("All fields are required.");
      return;
    }

    try {
      const response = await axios.post(`${API_ENDPOINTS.REGISTER}`, {phoneNumber, password, tenantId: schoolName});
      if (response.status === STATUS_CODES.CREATED) {
        console.log("Successfully registered!");
        navigate('/'); // Navigate to the login page after successful registration
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError("Failed to register. Please try again.");
    }
  };

  const inputStyle = {
    marginBottom: '10px',
    padding: '8px',
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '16px',
  };

  const formContainerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '300px',
    gap: '15px',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh'
    }}>
      <h1>Register</h1>
      <div style={formContainerStyle}>
        <input
          type="tel"
          placeholder="Phone Number"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          style={inputStyle}
        />
        <select
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          style={inputStyle}
        >
          <option value="">{loadingSchools?"Loading Schools":"Select School"}</option>
          {school.map((sch, idx) => {
            const value = sch.id;
            const label = sch.tenantName;
            return(<option key={idx} value={value}>{label}</option>);
          })}
        </select>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <button
          className="btn"
          style={{backgroundColor: "#28574F", color: "white", width: '100%'}}
          onClick={handleRegister}
        >
          Register
        </button>
      </div>
      {error && <p style={{color: 'red'}}>{error}</p>}
    </div>
  );
};

export default Register;
