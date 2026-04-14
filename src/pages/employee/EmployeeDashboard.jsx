import React, { useState, useEffect } from 'react';
import { getAdminFirestore } from '../../firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, subMonths, addMonths, isSameMonth, isSameDay } from "date-fns";
import './EmployeeDashboard.css';

export default function EmployeeDashboard({ employeeData, onLogout }) {
  // Memoize db instance to prevent listener resets on every clock tick
  const db = React.useMemo(() => 
    getAdminFirestore(employeeData?.firebaseConfig),
    [employeeData?.firebaseConfig]
  );

  const [localEmployeeData, setLocalEmployeeData] = useState(employeeData);
  const [lastAction, setLastAction] = useState(() => {
    const saved = localStorage.getItem(`emp_last_action_${employeeData.id}`);
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(!lastAction);
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // New states for Calendar & Profile
  const [allAttendance, setAllAttendance] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [pinUpdating, setPinUpdating] = useState(false);
  const [selectedDateDetails, setSelectedDateDetails] = useState({ open: false, date: "", records: [] });
  
  // PIN Visibility states
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [companySettings, setCompanySettings] = useState({ checkInTime: "09:00", checkOutTime: "18:00" });

  useEffect(() => {
    document.title = "Employee Dashboard - Attendance Management";
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Real-time listener for the employee's last action
    const q = query(
      collection(db, 'attendance'),
      where('employeeId', '==', employeeData.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docs = snapshot.docs.map(d => d.data());
        docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        setAllAttendance(docs);
        const latestInfo = docs[0];
        setLastAction(latestInfo);
        localStorage.setItem(`emp_last_action_${employeeData.id}`, JSON.stringify(latestInfo));
      } else {
        setAllAttendance([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Critical Sync Error:", err);
      setLoading(false);
    });

    // 2. Real-time listener to verify employee account still exists and sync role/name
    const empDocRef = doc(db, 'employees', employeeData.id);
    const unsubscribeEmp = onSnapshot(empDocRef, (docSnap) => {
      if (!docSnap.exists()) {
        alert("Your account has been removed by the administrator.");
        onLogout();
      } else {
        setLocalEmployeeData({ ...docSnap.data(), id: docSnap.id });
      }
    });

    const fetchSettings = async () => {
      try {
        const snap = await getDocs(collection(db, "companySettings"));
        const timingDoc = snap.docs.find(d => d.id === "timing");
        if (timingDoc) {
          setCompanySettings(timingDoc.data());
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();

    return () => {
      unsubscribe();
      unsubscribeEmp();
    };
  }, [employeeData.id, db, onLogout]);

  const handlePunch = async (type) => {
    setSaving(true);
    try {
      const now = new Date();
      const currentTodayStr = format(now, "yyyy-MM-dd");

      // Handle missing check-out from a previous day
      if (type === 'IN' && lastAction?.type === 'IN' && lastAction?.date !== currentTodayStr) {
        const autoOutData = {
          employeeId: employeeData.id,
          type: 'OUT',
          timestamp: new Date(lastAction.date + `T${companySettings.checkOutTime || "23:59"}:59`).getTime(),
          date: lastAction.date,
          status: 'AUTO_CLOSED',
          ...(employeeData.adminId || employeeData.companyId ? { adminId: employeeData.adminId || employeeData.companyId } : {})
        };
        await addDoc(collection(db, 'attendance'), autoOutData);
      }

      const attendanceData = {
        employeeId: employeeData.id,
        type: type,
        timestamp: now.getTime(),
        date: currentTodayStr,
        ...(employeeData.adminId || employeeData.companyId ? { adminId: employeeData.adminId || employeeData.companyId } : {})
      };

      await addDoc(collection(db, 'attendance'), attendanceData);
      setLastAction(attendanceData);
      localStorage.setItem(`emp_last_action_${employeeData.id}`, JSON.stringify(attendanceData));
      alert(`Successfully Checked ${type}!`);
    } catch (err) {
      console.error("Punch error detail:", err);
      alert(`Failed to record attendance: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isPunchedIn = lastAction?.type === 'IN' && lastAction?.date === todayStr;
  const hasHangingSession = lastAction?.type === 'IN' && lastAction?.date !== todayStr;

  // --- Profile Logic ---
  const handleUpdatePin = async (e) => {
    e.preventDefault();
    if (!newPin) {
      alert("Please enter a new PIN.");
      return;
    }
    setPinUpdating(true);
    try {
      await updateDoc(doc(db, "employees", employeeData.id), { pin: newPin });
      alert("PIN Updated Successfully!");
      setIsChangingPin(false);
      setNewPin("");
    } catch (err) {
      console.error(err);
      alert("Failed to update PIN");
    } finally {
      setPinUpdating(false);
    }
  };

  // --- Calendar Logic ---
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const getAttendanceStatus = (day) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (day > today) return "Future";

    const dateStr = format(day, "yyyy-MM-dd");
    const dayRecords = allAttendance.filter(r => r.date === dateStr);
    const hasIn = dayRecords.some(r => r.type === "IN");
    const hasOut = dayRecords.some(r => r.type === "OUT");

    const createdAt = new Date(localEmployeeData.createdAt || "2000-01-01");
    if (day < createdAt && !isSameDay(day, createdAt)) return "Not Joined";

    if (hasIn) {
      return "Present";
    }
    
    if (day.getDay() === 0 || day.getDay() === 6) return "Weekend";
    return "Absent";
  };

  const handleDateClick = (day) => {
    const status = getAttendanceStatus(day);
    if (status === "Future" || status === "Not Joined") return;

    const dateStr = format(day, "yyyy-MM-dd");
    const dayRecords = allAttendance
      .filter(r => r.date === dateStr)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    setSelectedDateDetails({
      open: true,
      date: format(day, "MMMM d, yyyy"),
      records: dayRecords
    });
  };

  const renderCalendarDays = () => {
    const dateFormat = "d";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        const status = getAttendanceStatus(cloneDay);
        
        let statusClass = "cal-future";
        if (status === "Present") statusClass = "cal-present";
        else if (status === "Absent") statusClass = "cal-absent";
        else if (status === "Weekend") statusClass = "cal-weekend";
        else if (status === "Not Joined") statusClass = "cal-disabled";

        days.push(
          <div
            className={`calendar-cell ${!isSameMonth(day, monthStart) ? "disabled-month" : ""} ${statusClass}`}
            key={day}
            onClick={() => handleDateClick(cloneDay)}
            style={{ cursor: status === "Future" || status === "Not Joined" ? "default" : "pointer" }}
          >
            <span className="cal-date">{formattedDate}</span>
            {isSameMonth(day, monthStart) && status && status !== "Future" && status !== "Not Joined" && (
              <span className="cal-status-label">{status}</span>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="calendar-row" key={day}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="calendar-body">{rows}</div>;
  };

  return (
    <div className="employee-dashboard-layout">
      <div className="employee-dashboard-container">
        <header className="employee-header">
           <div className="welcome-section">
             <h1>Hello, {localEmployeeData.name}</h1>
             <p className="role-badge">{localEmployeeData.role}</p>
           </div>
           
           <div className="header-actions">
             <button className="icon-btn-emp" onClick={() => setIsProfileOpen(true)} title="Profile & Settings">
               <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                 <circle cx="12" cy="7" r="4"></circle>
               </svg>
             </button>
             <button className="logout-btn-emp" onClick={onLogout}>Logout</button>
           </div>
        </header>

        {/* Date Details Modal */}
        {selectedDateDetails.open && (
          <div className="modal-overlay" onMouseDown={() => setSelectedDateDetails({ ...selectedDateDetails, open: false })}>
            <div className="modal-content-admin" style={{ maxWidth: '400px' }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-header-admin">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: 'var(--apple-orange-soft)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--apple-orange-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ fontSize: '16px', margin: 0, color: 'var(--apple-black)' }}>Daily Activity</h2>
                    <span style={{ fontSize: '12px', color: 'var(--apple-grey-text)' }}>{selectedDateDetails.date}</span>
                  </div>
                </div>
                <button className="close-btn-admin" onClick={() => setSelectedDateDetails({ ...selectedDateDetails, open: false })}>✕</button>
              </div>
              <div style={{ padding: '24px' }}>
                {selectedDateDetails.records.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {selectedDateDetails.records.map((rec, idx) => (
                      <div 
                        key={idx} 
                        className="log-entry-card"
                        style={{ 
                          background: 'var(--apple-orange-soft)', 
                          borderLeft: `4px solid ${rec.type === 'IN' ? 'var(--apple-orange-base)' : 'var(--apple-orange-deep)'}`
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="log-entry-type-badge" style={{ color: 'var(--apple-orange-deep)' }}>
                            {rec.type === 'IN' ? 'Check IN' : 'Check OUT'}
                          </span>
                          <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--apple-black)', marginTop: '4px' }}>
                            {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ background: 'var(--apple-white)', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', color: 'var(--apple-orange-base)', border: '1px solid var(--apple-orange-base)' }}>
                          LOGGED
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ width: '56px', height: '56px', background: 'var(--apple-orange-soft)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--apple-orange-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
                    <p style={{ margin: 0, color: 'var(--apple-grey-text)', fontWeight: '500', fontSize: '14px' }}>No activity found for this date.</p>
                  </div>
                )}
                
                <button 
                  onClick={() => setSelectedDateDetails({ ...selectedDateDetails, open: false })}
                  className="logout-btn-emp"
                  style={{ width: '100%', marginTop: '24px', padding: '14px', border: '1px solid var(--apple-orange-soft)', borderRadius: '12px' }}
                >
                  Close View
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile Modal */}
        {isProfileOpen && (
          <div className="modal-overlay" onMouseDown={() => setIsProfileOpen(false)}>
            <div className="modal-content-admin" style={{ maxWidth: '400px' }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-header-admin">
                <h2>My Profile</h2>
                <button className="close-btn-admin" onClick={() => setIsProfileOpen(false)}>✕</button>
              </div>
              <div style={{ padding: '24px' }}>
                 <div className="profile-avatar-wrapper">
                    <div className="profile-avatar-circle">
                       <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                         <circle cx="12" cy="7" r="4"></circle>
                       </svg>
                    </div>
                 </div>

                 <div className="info-box-styled">
                    <span className="info-section-label">Full Name</span>
                    <p className="info-box-value">{localEmployeeData.name}</p>
                 </div>

                 <div className="info-box-styled">
                    <span className="info-section-label">Employee Identity</span>
                    <p className="info-box-value">#{localEmployeeData.empId?.toUpperCase()}</p>
                 </div>

                 <div className="info-box-styled" style={{ marginBottom: '24px' }}>
                    <span className="info-section-label">Access Credentials</span>
                    <div className="pin-reveal-box">
                      <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--apple-black)', letterSpacing: showCurrentPin ? '2px' : '4px' }}>
                        {showCurrentPin ? localEmployeeData.pin : '••••'}
                      </span>
                      <button 
                        onClick={() => setShowCurrentPin(!showCurrentPin)}
                        style={{ background: 'var(--apple-orange-soft)', border: 'none', cursor: 'pointer', color: 'var(--apple-orange-base)', padding: '6px', borderRadius: '6px', display: 'flex' }}
                      >
                        {showCurrentPin ? (
                           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                        ) : (
                           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        )}
                      </button>
                    </div>
                 </div>

                 <div style={{ borderTop: '1px solid var(--apple-orange-soft)', paddingTop: '20px' }}>
                    <button 
                      onClick={() => setIsChangingPin(true)}
                      className="security-confirm-btn"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                      Update Security PIN
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Change PIN Pop-up (Secondary Modal) */}
        {isChangingPin && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onMouseDown={() => setIsChangingPin(false)}>
            <div className="modal-content-admin" style={{ maxWidth: '380px' }} onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header-admin">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <div className="security-icon-header">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                     </div>
                     <h2 style={{ fontSize: '18px', margin: 0 }}>Update PIN</h2>
                  </div>
                  <button className="close-btn-admin" onClick={() => setIsChangingPin(false)}>✕</button>
                </div>
                <div style={{ padding: '24px' }}>
                   <div style={{ background: 'var(--apple-orange-soft)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--apple-orange-base)' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--apple-orange-deep)', lineHeight: '1.6', textAlign: 'center' }}>
                        Changing your login PIN will require you to use the new code for all future logins.
                      </p>
                   </div>
                   
                   <form onSubmit={handleUpdatePin}>
                     <div style={{ marginBottom: '24px' }}>
                       <label className="info-section-label">New 4-6 Digit PIN</label>
                       <div style={{ position: 'relative' }}>
                         <input 
                           type={showNewPin ? "text" : "password"} 
                           value={newPin}
                           onChange={(e) => setNewPin(e.target.value)}
                           placeholder="Enter new PIN"
                           style={{ width: '100%', padding: '14px 45px 14px 16px', borderRadius: '12px', border: '2px solid var(--apple-orange-soft)', boxSizing: 'border-box', fontSize: '16px', fontWeight: '600' }}
                           required
                         />
                         <button 
                           type="button"
                           onClick={() => setShowNewPin(!showNewPin)}
                           style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--apple-grey-text)' }}
                         >
                           {showNewPin ? (
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                           ) : (
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                           )}
                         </button>
                       </div>
                     </div>
                     <button 
                       type="submit" 
                       className="security-confirm-btn"
                       style={{ padding: '16px' }}
                       disabled={pinUpdating}
                     >
                       {pinUpdating ? 'Securing Account...' : 'Confirm & Save PIN'}
                     </button>
                     <button 
                       type="button"
                       onClick={() => setIsChangingPin(false)}
                       style={{ width: '100%', marginTop: '12px', padding: '12px', background: 'transparent', color: 'var(--apple-grey-text)', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
                     >
                       Go Back
                     </button>
                   </form>
                </div>
            </div>
          </div>
        )}

        <main className="employee-main">
          {/* Daily punch card */}

          <div className="punch-card-emp">
            <div className="time-display">
              <h2>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</h2>
              <p>{currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>

            <div className="status-display">
               <span className={`status-dot ${isPunchedIn ? 'online' : 'offline'}`}></span>
               <span>Status: <strong>{isPunchedIn ? 'Checked IN' : 'Checked OUT'}</strong></span>
            </div>

            <div className="action-buttons-emp">
              <button 
                className={`punch-btn-emp in ${isPunchedIn ? 'disabled' : ''}`}
                onClick={() => handlePunch('IN')}
                disabled={saving || isPunchedIn}
              >
                {saving && !isPunchedIn ? '...' : 'CHECK IN'}
              </button>
              <button 
                className={`punch-btn-emp out ${!isPunchedIn ? 'disabled' : ''}`}
                onClick={() => handlePunch('OUT')}
                disabled={saving || !isPunchedIn}
              >
                {saving && isPunchedIn ? '...' : 'CHECK OUT'}
              </button>
            </div>
          </div>

          <div className="info-card-emp">
            <h3>Last Activity</h3>
            {loading ? (
              <p>Loading...</p>
            ) : lastAction ? (
              <div className="last-action-details">
                <p>Type: <strong>{lastAction.type}</strong></p>
                <p>Time: <strong>{new Date(lastAction.timestamp).toLocaleTimeString()}</strong></p>
                <p>Date: <strong>{lastAction.date}</strong></p>
              </div>
            ) : (
              <p>No activity recorded yet today.</p>
            )}
          </div>

          <div className="emp-calendar-section">
            <div className="emp-calendar-header">
              <h3>My Attendance - {format(currentDate, "MMMM yyyy")}</h3>
              <div className="cal-nav-buttons">
                <button onClick={prevMonth}>{"<"}</button>
                <button onClick={nextMonth} disabled={isSameMonth(currentDate, new Date())}>{">"}</button>
              </div>
            </div>
            
            <div className="calendar-wrapper">
              <div className="calendar-days-header">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div className="day-name" key={d}>{d}</div>
                ))}
              </div>
              {renderCalendarDays()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
