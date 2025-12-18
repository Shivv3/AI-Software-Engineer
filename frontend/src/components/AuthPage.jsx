import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './AuthPage.css';

axios.defaults.withCredentials = true;

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login form state
  const [loginData, setLoginData] = useState({
    user_id: '',
    password: ''
  });

  // Register form state
  const [registerData, setRegisterData] = useState({
    name: '',
    email: '',
    user_id: '',
    password: '',
    confirmPassword: '',
    phone_number: '',
    age: ''
  });

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setRegisterData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', {
        user_id: loginData.user_id,
        password: loginData.password
      });

      if (response.data.success) {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (registerData.password !== registerData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (registerData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post('/api/auth/register', {
        name: registerData.name,
        email: registerData.email,
        user_id: registerData.user_id,
        password: registerData.password,
        phone_number: registerData.phone_number || null,
        age: registerData.age ? parseInt(registerData.age) : null
      });

      if (response.data.success) {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="gradient-orb gradient-orb-1"></div>
        <div className="gradient-orb gradient-orb-2"></div>
        <div className="gradient-orb gradient-orb-3"></div>
      </div>

      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-badge-wrapper">
              <span className="auth-badge">
                <span className="badge-icon">⚡</span>
                AI Software Engineer
              </span>
            </div>
            <h1 className="auth-title">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="auth-subtitle">
              {mode === 'login' 
                ? 'Sign in to manage your projects and continue your work'
                : 'Register to start managing your software engineering projects'}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Login
            </button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="auth-error">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="login_user_id">User ID</label>
                <input
                  id="login_user_id"
                  type="text"
                  name="user_id"
                  placeholder="Enter your user ID"
                  value={loginData.user_id}
                  onChange={handleLoginChange}
                  required
                  className="auth-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="login_password">Password</label>
                <input
                  id="login_password"
                  type="password"
                  name="password"
                  placeholder="Enter your password"
                  value={loginData.password}
                  onChange={handleLoginChange}
                  required
                  className="auth-input"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="auth-button gradient-button"
              >
                {loading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              <div className="form-group">
                <label htmlFor="register_name">Full Name</label>
                <input
                  id="register_name"
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={registerData.name}
                  onChange={handleRegisterChange}
                  required
                  className="auth-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="register_email">Email</label>
                <input
                  id="register_email"
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  value={registerData.email}
                  onChange={handleRegisterChange}
                  required
                  className="auth-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="register_user_id">User ID</label>
                <input
                  id="register_user_id"
                  type="text"
                  name="user_id"
                  placeholder="Choose a unique user ID"
                  value={registerData.user_id}
                  onChange={handleRegisterChange}
                  required
                  className="auth-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="register_password">Password</label>
                  <input
                    id="register_password"
                    type="password"
                    name="password"
                    placeholder="Create a password"
                    value={registerData.password}
                    onChange={handleRegisterChange}
                    required
                    minLength={6}
                    className="auth-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="register_confirmPassword">Confirm Password</label>
                  <input
                    id="register_confirmPassword"
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm your password"
                    value={registerData.confirmPassword}
                    onChange={handleRegisterChange}
                    required
                    minLength={6}
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="register_phone_number">Phone Number</label>
                  <input
                    id="register_phone_number"
                    type="tel"
                    name="phone_number"
                    placeholder="Enter your phone number"
                    value={registerData.phone_number}
                    onChange={handleRegisterChange}
                    className="auth-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="register_age">Age</label>
                  <input
                    id="register_age"
                    type="number"
                    name="age"
                    placeholder="Enter your age"
                    value={registerData.age}
                    onChange={handleRegisterChange}
                    min="1"
                    max="120"
                    className="auth-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="auth-button gradient-button"
              >
                {loading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="43.98" strokeDashoffset="10.99">
                        <animate attributeName="stroke-dashoffset" values="43.98;0;43.98" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

