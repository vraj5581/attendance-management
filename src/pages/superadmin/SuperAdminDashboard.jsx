import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import "./SuperAdminDashboard.css";

export default function SuperAdminDashboard({ onLogout }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchAdmins = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "admins"));
      const adminsList = querySnapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));
      setAdmins(adminsList);
    } catch (error) {
      console.error("Error fetching admins: ", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Super Admin Dashboard - Attendance Management";
    fetchAdmins();
  }, []);

  const handleDeleteAdmin = async (id) => {
    if (
      window.confirm(
        "Are you sure you want to delete this admin and ALL of its associated data (employees, attendances)? This action is permanent.",
      )
    ) {
      try {
        const qEmployees = query(
          collection(db, "employees"),
          where("companyId", "==", id),
        );
        const empSnap = await getDocs(qEmployees);
        const empDeletes = empSnap.docs.map((emp) =>
          deleteDoc(doc(db, "employees", emp.id)),
        );

        const qAttendance = query(
          collection(db, "attendance"),
          where("companyId", "==", id),
        );
        const attSnap = await getDocs(qAttendance);
        const attDeletes = attSnap.docs.map((att) =>
          deleteDoc(doc(db, "attendance", att.id)),
        );

        await Promise.all([...empDeletes, ...attDeletes]);
        await deleteDoc(doc(db, "admins", id));
        fetchAdmins();
      } catch (error) {
        console.error("Error deleting admin: ", error);
        alert("Failed to delete admin.");
      }
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-text">
          <h1>Super Admin Dashboard</h1>
          <p className="admin-count-tag">
            Total Managed Admins: {admins.length}
          </p>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>

      <div className="dashboard-content">
        <div className="admins-header">
          <h2>Manage Admins</h2>
          <button
            className="add-fab-btn"
            onClick={() => navigate("/superadmin/admins/add")}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span className="add-admin-text">Add New Admin</span>
          </button>
        </div>

        {loading ? (
          <div className="loading-text">Fetching admin accounts...</div>
        ) : admins.length === 0 ? (
          <div className="loading-text">
            No admins found. Click 'Add New Admin' to get started.
          </div>
        ) : (
          <div className="admin-list">
            {admins.map((admin) => (
              <div key={admin.id} className="admin-card">
                <div className="card-actions">
                  <button
                    className="icon-btn edit-btn"
                    onClick={() =>
                      navigate(`/superadmin/admins/edit/${admin.id}`)
                    }
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button
                    className="icon-btn delete-btn"
                    onClick={() => handleDeleteAdmin(admin.id)}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
                <div
                  className="admin-logo-preview"
                  style={{ marginBottom: "15px" }}
                >
                  {admin.logoUrl ? (
                    <img
                      src={admin.logoUrl}
                      alt="Logo"
                      style={{
                        maxWidth: "40px",
                        maxHeight: "40px",
                        borderRadius: "4px",
                      }}
                    />
                  ) : (
                    <div
                      className="logo-placeholder"
                      style={{
                        width: "40px",
                        height: "40px",
                        background: "var(--apple-orange-soft)",
                        color: "var(--apple-orange-base)",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "800",
                      }}
                    >
                      {(admin.adminName || admin.companyName || "A").charAt(0)}
                    </div>
                  )}
                </div>
                <h3>{admin.adminName || admin.companyName}</h3>
                <div className="admin-detail">
                  <span className="label">Login ID:</span>
                  <span className="value">{admin.loginId}</span>
                </div>
                <div className="admin-detail">
                  <span className="label">Password:</span>
                  <span className="value">{admin.password}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
