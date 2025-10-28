import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const REGISTER_URL = `${BASE_URL}/tenant/register`;

const STATUS_CREATED = 201;

const Register = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleRegister = async () => {

    if (!email || !password || !name) {
      setError("All fields are required.");
      return;
    }

    try {
      const response = await axios.post(`${REGISTER_URL}`, {email, password, name});
      if (response.status === STATUS_CREATED) {
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
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
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
