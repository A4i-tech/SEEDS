import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Register = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);

    const handleRegister = async () => {
        const baseURL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000"; // Fallback to localhost:4000

        if (!email || !password || !name) {
            setError("All fields are required.");
            return;
        }

        try {
            const response = await axios.post(`${baseURL}/tenant/register`, { email, password, name });
            if (response.status === 201) {
                console.log("Successfully registered!");
                navigate('/'); // Navigate to the login page after successful registration
            }
        } catch (err) {
            console.error("Registration error:", err);
            setError("Failed to register. Please try again.");
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <h1>Register</h1>
            <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ marginBottom: '10px', padding: '8px', width: '200px' }}
            />
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ marginBottom: '10px', padding: '8px', width: '200px' }}
            />
            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ marginBottom: '10px', padding: '8px', width: '200px' }}
            />
            <button
                className="btn"
                style={{ backgroundColor: "#28574F", color: "white", marginBottom: '10px' }}
                onClick={handleRegister}
            >
                Register
            </button>
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
};

export default Register;
