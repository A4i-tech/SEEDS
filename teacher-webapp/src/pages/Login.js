import React from 'react';
import {useState} from 'react';
import axios from 'axios';
import {API_ENDPOINTS} from "../constants/apiEndpoints";
import {STATUS_CODES} from "../constants/statusCodes";
import {useNavigation} from "../hooks/useNavigation";

function Login() {
  const navigate = useNavigation();
  const [showError, setShowError] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");

  const handleLogin = async () => {
    if (!phoneNumber || !password || !schoolName) {
      setShowError(true);
      return;
    }

    try {
      const response = await axios.post(`${API_ENDPOINTS.LOGIN}`, {phoneNumber, password, tenantName: schoolName});
      console.log(response);
      if (response.status === STATUS_CODES.SUCCESS) {
        localStorage.setItem('authToken', response.data.token);
        navigate.goToHome(response.data.phoneNumber);
      } else {
        setShowError(true);
      }
    } catch (error) {
      console.error("Login error:", error);
      setShowError(true);
    }
  };

  const handleRegister = () => {
    navigate.goToRegister();
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
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column'
    }}>
      <h1>Login</h1>
      <br/>
      <div style={formContainerStyle}>
        <input
          type="tel"
          placeholder="Phone Number"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="School Name"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          style={inputStyle}
        />
        <button className="btn" onClick={handleLogin} style={{padding: '10px 20px', fontSize: '16px'}}>Login
        </button>
        <span style={{color: "#28574F", cursor: "pointer", textDecoration: "underline"}}
              onClick={handleRegister}>Signup</span>
      </div>
      {showError && <p style={{color: 'red'}}>Login failed. Please check your credentials.</p>}
    </div>
  );
}

export default Login;