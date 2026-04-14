import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import "./Login.css";

export default function Login({ onLogin }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // New state for eye toggle
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [knownAdmins, setKnownAdmins] = useState([]);

  useEffect(() => {
    document.title = "Login - Attendance Management";
  }, []);

  // Intelligent: Pre-fetch admin IDs to make the UI smarter
  useEffect(() => {
    const fetchKnown = async () => {
      try {
        const snap = await getDocs(collection(db, "admins"));
        setKnownAdmins(
          snap.docs.map((d) => d.data().loginId?.toLowerCase().trim()),
        );
      } catch (e) {
        console.error("Failed to pre-fetch admins:", e);
      }
    };
    fetchKnown();
  }, []);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      setError("");
      const normalizedLoginId = loginId.toLowerCase().trim();

      // 1. Check for Super Admin (highest priority)
      if (normalizedLoginId === "hitnish" && password === "1234") {
        onLogin({ role: "superadmin" });
        return;
      }

      // 2. Fetch all admins once to avoid redundant database hits
      const adminSnapshot = await getDocs(collection(db, "admins"));
      const allAdmins = adminSnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // 3. Try to match as a Company Admin
      const adminMatch = allAdmins.find(
        (a) =>
          a.loginId?.toLowerCase().trim() === normalizedLoginId &&
          String(a.password).trim() === String(password).trim(),
      );

      if (adminMatch) {
        onLogin({ ...adminMatch, authRole: "admin", role: "admin" });
        return;
      }

      // 4. Try to match as an Employee (Globally unique ID across all databases)
      let foundEmpMatch = null;
      let foundAdminConfig = null;
      let foundAdmin = null;

      for (const targetAdmin of allAdmins) {
        const adminConfig = targetAdmin.firebaseConfig;
        if (!adminConfig || !adminConfig.apiKey) continue;

        try {
          const { getAdminFirestore } = await import("../../firebase");
          const privateDb = getAdminFirestore(adminConfig);
          const q = query(collection(privateDb, "employees"), where("empId", "==", normalizedLoginId));
          const empSnapshot = await getDocs(q);
          
          if (!empSnapshot.empty) {
             foundEmpMatch = empSnapshot.docs[0];
             foundAdminConfig = adminConfig;
             foundAdmin = targetAdmin;
             break; // Found the globally unique employee!
          }
        } catch (e) {
          console.error("Error querying private db for admin:", targetAdmin.loginId, e);
        }
      }

      if (foundEmpMatch) {
         const empData = foundEmpMatch.data();
         if (String(empData.pin).trim() === String(password).trim()) {
            onLogin({
              ...empData,
              id: foundEmpMatch.id,
              authRole: "employee",
              firebaseConfig: foundAdminConfig,
              adminId: foundAdmin.id,
            });
            return;
         } else {
            setError("Invalid PIN for this Employee ID.");
            setLoading(false);
            return;
         }
      }

      // Fallback: If we reach here, no match was found
      setError("Invalid login details. ID or Password incorrect.");
    } catch (err) {
      console.error(err);
      setError("An error occurred during login. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card-unified">
        <div className="login-head-branding">
          <h1>Login</h1>
          <p className="login-subtitle">Attendance Management System</p>
        </div>

        <form className="login-form-unified" onSubmit={handleSubmit}>
          <div className="login-field-group">
            <label htmlFor="loginId">Login ID</label>
            <input
              type="text"
              id="loginId"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Enter your ID"
              required
            />
          </div>

          <div className="login-field-group">
            <label htmlFor="password">Password / PIN</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your secret"
                required
              />
              <button
                type="button"
                className="eye-toggle-btn-unified"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>



          {error && <div className="login-error-msg">{error}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? "Validating..." : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
