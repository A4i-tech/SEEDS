import React, { useEffect } from 'react';
// import 'firebase/auth';
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import axios from 'axios';
import firebaseConfig from "../firebase";
import { initializeApp } from "firebase/app";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const baseURL = process.env.REACT_APP_API_BASE_URL;

const Login = () => {
    const navigate = useNavigate();
    const [showError, setShowError] = useState(false);
    const [loginType, setLoginType] = useState(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {

        // Fetch login type from tenantRouter
        axios.get(`${baseURL}/tenant/logintype`)
            .then(response => {
                setLoginType(response.data.loginType);
            })
            .catch(error => {
                console.error("Error fetching login type:", error.message);
                if (error.response) {
                    console.error("Response data:", error.response.data);
                    console.error("Response status:", error.response.status);
                    console.error("Response headers:", error.response.headers);
                } else if (error.request) {
                    console.error("Request data:", error.request);
                } else {
                    console.error("Error message:", error.message);
                }
            });
    }, []);

    const handleGoogleSignIn = async () => {
        const auth = getAuth();
        const provider = new GoogleAuthProvider();

        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const idToken = await user.getIdToken(); // Get Firebase ID token

            // Send the ID token in the 'authtoken' header to the backend for verification
            const response = await axios.post(
                `${baseURL}/tenant/login`,
                {},
                {
                    headers: {
                        authtoken: idToken,
                    },
                }
            );

            if (response.status === 200) {
                navigate('/content', { state: { name: user.displayName } });
            } else {
                setShowError(true);
            }
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            setShowError(true);
        }
    };

    // Temporarily mock native login (skip Firebase auth)
    const handleNativeLogin = async () => {
        if (!email || !password) {
            setShowError(true);
            return;
        }

        try {
            const response = await axios.post(`${baseURL}/tenant/login`, { email, password });
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
            {loginType === 'firebase' && (
                <button className="btn" style={{ backgroundColor: "#28574F", color: "white" }} onClick={handleGoogleSignIn}>Sign in with Google</button>
            )}
            {loginType === 'native' && (
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
                    <button className="btn" style={{ backgroundColor: "#28574F", color: "white" }} onClick={handleNativeLogin}>Login</button>
                    <span style={{ color: "#28574F", cursor: "pointer", textDecoration: "underline" }} onClick={handleRegister}>Signup</span>
                </div>
            )}
            {showError && <p style={{ color: 'red' }}>Error Occurred</p>}
        </div>
    );
};

export default Login;
