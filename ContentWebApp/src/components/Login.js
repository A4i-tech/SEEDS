import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import axios from 'axios';


const baseURL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000"; // Fallback to localhost:4000

const Login = () => {
    const navigate = useNavigate();
    const [showError, setShowError] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async () => {
        if (!email || !password) {
            setShowError(true);
            return;
        }

        try {
            const response = await axios.post(`${baseURL}/tenant/login`, { email, password });
            console.log(response);
            if (response.status === 200) {
                const { name } = response.data;
                navigate('/content', { state: { name } });
            } else {
                setShowError(true);
            }
        } catch (error) {
            console.error("Login error:", error);
            setShowError(true);
        }
    };

    const handleRegister = () => {
        navigate('/register'); // Navigate to the registration page
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
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <h1>Welcome to SEEDS</h1>
            <br />
            <div style={formContainerStyle}>
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
                <button className="btn" style={{ backgroundColor: "#28574F", color: "white" }} onClick={handleLogin}>Login</button>
                <span style={{ color: "#28574F", cursor: "pointer", textDecoration: "underline" }} onClick={handleRegister}>Signup</span>
            </div>
            {showError && <p style={{ color: 'red' }}>Error Occurred</p>}
        </div>
    );
};

export default Login;
