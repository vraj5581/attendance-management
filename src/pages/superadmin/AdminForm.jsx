import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  addDoc,
  getDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import "./AdminForm.css";

export default function AdminForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(id ? true : false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [adminName, setAdminName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // Eye toggle state
  const [logoUrl, setLogoUrl] = useState("");
  
  // Firebase Config State
  const [fbApiKey, setFbApiKey] = useState("");
  const [fbAuthDomain, setFbAuthDomain] = useState("");
  const [fbProjectId, setFbProjectId] = useState("");
  const [fbStorageBucket, setFbStorageBucket] = useState("");
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState("");
  const [fbAppId, setFbAppId] = useState("");
  const [fbMeasurementId, setFbMeasurementId] = useState("");

  useEffect(() => {
    document.title = id ? "Edit Admin - Attendance Management" : "Add Admin - Attendance Management";
    if (id) {
      const fetchAdmin = async () => {
        try {
          const docRef = doc(db, "admins", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setAdminName(data.adminName || data.companyName || "");
            setLoginId(data.loginId || "");
            setPassword(data.password || "");
            setLogoUrl(data.logoUrl || "");
            setFbApiKey(data.firebaseConfig?.apiKey || "");
            setFbAuthDomain(data.firebaseConfig?.authDomain || "");
            setFbProjectId(data.firebaseConfig?.projectId || "");
            setFbStorageBucket(data.firebaseConfig?.storageBucket || "");
            setFbMessagingSenderId(data.firebaseConfig?.messagingSenderId || "");
            setFbAppId(data.firebaseConfig?.appId || "");
            setFbMeasurementId(data.firebaseConfig?.measurementId || "");
          } else {
            console.error("No such admin document!");
            navigate("/superadmin/dashboard");
          }
        } catch (error) {
          console.error("Error fetching admin:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchAdmin();
    }
  }, [id, navigate]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setLogoUrl(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!adminName || !loginId || !password) return;

    setSaving(true);
    try {
      const data = {
        adminName,
        companyName: adminName,
        loginId: loginId.toLowerCase().trim(),
        password,
        logoUrl,
        firebaseConfig: {
          apiKey: fbApiKey,
          authDomain: fbAuthDomain,
          projectId: fbProjectId,
          storageBucket: fbStorageBucket,
          messagingSenderId: fbMessagingSenderId,
          appId: fbAppId,
          measurementId: fbMeasurementId,
        },
      };

      if (id) {
        await updateDoc(doc(db, "admins", id), data);
      } else {
        await addDoc(collection(db, "admins"), {
          ...data,
          createdAt: new Date().toISOString(),
        });
      }
      navigate("/superadmin/dashboard");
    } catch (error) {
      console.error("Error saving admin:", error);
      alert("Failed to save admin details.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="form-page-container">
        <div className="loading-container-form">
          <div className="spinner"></div>
          <p>Loading Admin Profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page-container">
      <div className="form-header">
        <button className="back-btn" onClick={() => navigate("/superadmin/dashboard")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back
        </button>
        <h1>{id ? "Edit Admin" : "Add New Admin"}</h1>
      </div>

      <div className="admin-form-card">
        <form onSubmit={handleSubmit}>
          <section className="form-section">
            <h3>General Information</h3>
            <div className="input-group">
              <label>Admin/Company Name</label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="e.g. Acme Corp"
                required
              />
            </div>

            <div className="input-group">
              <label>Admin Logo (Image Upload)</label>
              <div className="upload-wrapper">
                <input type="file" accept="image/*" onChange={handleLogoUpload} />
                {logoUrl && (
                  <div className="logo-preview-box">
                    <img src={logoUrl} alt="Logo Preview" />
                    <button type="button" onClick={() => setLogoUrl("")} className="remove-logo">Remove</button>
                  </div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="input-group">
                <label>Login Email</label>
                <input
                  type="email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div className="input-group">
                <label>Login Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Secure Password"
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn-unified"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="form-section">
            <h3>Private Firebase Configuration</h3>
            <div className="config-grid">
              <div className="input-group">
                <label>API Key</label>
                <input
                  type="text"
                  value={fbApiKey}
                  onChange={(e) => setFbApiKey(e.target.value)}
                  placeholder="Firebase API Key"
                  required
                />
              </div>
              <div className="input-group">
                <label>Auth Domain</label>
                <input
                  type="text"
                  value={fbAuthDomain}
                  onChange={(e) => setFbAuthDomain(e.target.value)}
                  placeholder="project.firebaseapp.com"
                  required
                />
              </div>
              <div className="input-group">
                <label>Project ID</label>
                <input
                  type="text"
                  value={fbProjectId}
                  onChange={(e) => setFbProjectId(e.target.value)}
                  placeholder="project-id"
                  required
                />
              </div>
              <div className="input-group">
                <label>Storage Bucket</label>
                <input
                  type="text"
                  value={fbStorageBucket}
                  onChange={(e) => setFbStorageBucket(e.target.value)}
                  placeholder="project.appspot.com"
                  required
                />
              </div>
              <div className="input-group">
                <label>Messaging Sender ID</label>
                <input
                  type="text"
                  value={fbMessagingSenderId}
                  onChange={(e) => setFbMessagingSenderId(e.target.value)}
                  placeholder="123456789"
                  required
                />
              </div>
              <div className="input-group">
                <label>App ID</label>
                <input
                  type="text"
                  value={fbAppId}
                  onChange={(e) => setFbAppId(e.target.value)}
                  placeholder="1:123:web:abc"
                  required
                />
              </div>
            </div>
          </section>

          <div className="form-actions">
            <button type="submit" className="save-btn" disabled={saving}>
              {saving ? "Saving Changes..." : (id ? "Update Admin" : "Save Admin Account")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
