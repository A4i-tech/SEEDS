import React, { useEffect } from 'react';
// import 'firebase/auth';
// import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import axios from 'axios';

const baseURL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000"; // Fallback to localhost:4000

const Login = () => {
    // const auth = getAuth();
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

    /*
    const handleGoogleSignIn = () => {
        const provider = new GoogleAuthProvider();

        signInWithPopup(auth, provider)
            .then((result) => {
                const user = result.user;
                navigate('/content', { state: { name: user.displayName } });
            })
            .catch((error) => {
                console.error("Google Sign-In Error:", error);
                setShowError(true);
            });
    };
    */

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <h1>Welcome to SEEDS</h1>
            <br />
            {loginType === 'firebase' && (
                <p>Google Sign-In is currently disabled.</p>
                // <button className="btn" style={{ backgroundColor: "#28574F", color: "white" }} onClick={handleGoogleSignIn}>Sign in with Google</button>
            )}
            {loginType === 'native' && (
                <div>
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
                    <button className="btn" style={{ backgroundColor: "#28574F", color: "white", marginRight: '10px' }} onClick={handleNativeLogin}>Login</button>
                    <button className="btn" style={{ backgroundColor: "#28574F", color: "white" }} onClick={handleRegister}>Register</button>
                </div>
            )}
            {showError && <p style={{ color: 'red' }}>Error Occurred</p>}
        </div>
    );
};

export default Login;
