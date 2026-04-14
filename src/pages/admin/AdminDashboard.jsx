import React, { useState, useEffect } from "react";
import { getAdminFirestore, db as centralDb } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format, subMonths, addMonths, isSameMonth, isSameDay } from "date-fns";
import "./AdminDashboard.css";

export default function AdminDashboard({ adminData, onLogout }) {
  // Memoize db instance to prevent listener resets on every clock tick (currentTime)
  const db = React.useMemo(
    () => getAdminFirestore(adminData?.firebaseConfig),
    [adminData?.firebaseConfig],
  );

  // Persist Active Tab on Refresh
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem("adminData_active_tab") || "dashboard",
  );

  useEffect(() => {
    localStorage.setItem("adminData_active_tab", activeTab);
  }, [activeTab]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [employees, setEmployees] = useState([]);
  const todayString = new Date().toLocaleDateString("en-CA");

  const [todayAttendances, setTodayAttendances] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);

  const [selectedDate, setSelectedDate] = useState(todayString);
  const [rawRecordsAttendances, setRawRecordsAttendances] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [empDirectorySearchTerm, setEmpDirectorySearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [companySettings, setCompanySettings] = useState({ checkInTime: "09:00", checkOutTime: "18:00" });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [calendarCurrentDate, setCalendarCurrentDate] = useState(new Date());

  const monthStart = startOfMonth(calendarCurrentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = [];
  let dayIter = startDate;
  while (dayIter <= endDate) {
    calendarDays.push(dayIter);
    dayIter = addDays(dayIter, 1);
  }

  const recordsAttendances = React.useMemo(() => {
    return rawRecordsAttendances.filter((rec) => {
      // 1. Date Filter
      if (selectedDate && rec.date !== selectedDate) return false;

      // 2. Action Filter
      if (filterAction && rec.type !== filterAction) return false;

      // 3. Employee Search Filter
      if (searchTerm) {
        const empObj = employees.find((e) => e.id === rec.employeeId);
        const empName = empObj ? empObj.name.toLowerCase() : "unknown employee";
        if (!empName.includes(searchTerm.toLowerCase())) return false;
      }

      // 4. Time Filter
      if (startTime || endTime) {
        const dateObj = new Date(rec.timestamp);
        const hours = dateObj.getHours().toString().padStart(2, "0");
        const mins = dateObj.getMinutes().toString().padStart(2, "0");
        const timeStr = `${hours}:${mins}`;
        if (startTime && timeStr < startTime) return false;
        if (endTime && timeStr > endTime) return false;
      }
      return true;
    });
  }, [
    rawRecordsAttendances,
    selectedDate,
    filterAction,
    searchTerm,
    startTime,
    endTime,
    employees,
  ]);

  const [quickViewModal, setQuickViewModal] = useState({
    open: false,
    title: "",
    employees: [],
  });

  const openQuickView = (title, list) => {
    setQuickViewModal({ open: true, title, employees: list });
  };

  const [hoursWorkedModal, setHoursWorkedModal] = useState({
    open: false,
    empName: "",
    dateStr: "",
    hours: 0,
    mins: 0,
    status: "",
  });

  const [trendDetailModal, setTrendDetailModal] = useState({
    open: false,
    day: null,
  });

  const handleEmployeeClick = (empId, empName, dateStr) => {
    const dayRecords = rawRecordsAttendances.filter(
      (r) => r.employeeId === empId && r.date === dateStr
    );
    dayRecords.sort((a, b) => a.timestamp - b.timestamp);
    
    let totalMs = 0;
    let lastIn = null;
    
    dayRecords.forEach((r) => {
      if (r.type === "IN") {
        lastIn = r.timestamp;
      } else if (r.type === "OUT") {
        if (lastIn) {
          totalMs += r.timestamp - lastIn;
          lastIn = null;
        }
      }
    });

    let isStillNotCheckedOut = false;
    if (lastIn) {
      isStillNotCheckedOut = true;
    }

    const hours = Math.floor(totalMs / (1000 * 60 * 60));
    const mins = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

    setHoursWorkedModal({
      open: true,
      empName,
      dateStr,
      hours,
      mins,
      isStillNotCheckedOut,
    });
  };

  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    document.title = "Admin Dashboard - Attendance Management";
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState(null);

  const [empName, setEmpName] = useState("");
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false); // Toggle for PIN visibility
  const [role, setRole] = useState("Employee");
  const [saving, setSaving] = useState(false);

  // Manual Punch State
  const [isManualPunchOpen, setIsManualPunchOpen] = useState(false);
  const [manualPunchEmp, setManualPunchEmp] = useState(null);
  const [manualPunchType, setManualPunchType] = useState("IN");
  const [manualPunchDate, setManualPunchDate] = useState("");
  const [manualPunchTime, setManualPunchTime] = useState("");

  // Attendance Edit State
  const [isEditAttendanceOpen, setIsEditAttendanceOpen] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState(null);
  const [editAttDate, setEditAttDate] = useState("");
  const [editAttTime, setEditAttTime] = useState("");

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      const d = new Date();
      d.setDate(d.getDate() - 6);
      const last7DaysString = d.toLocaleDateString("en-CA");

      // 1. Fetch Employees
      let emps = [];
      try {
        const empSnapshot = await getDocs(
          query(
            collection(db, "employees"),
            where("adminId", "==", adminData.id),
          ),
        );
        emps = empSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(emps);
      } catch (err) {
        console.error("Error fetching employees:", err);
      }

      const totalEmps = emps.length;

      // 2. Fetch Graph Data in parallel
      const graphSnapshot = await getDocs(
        query(
          collection(db, "attendance"),
          where("adminId", "==", adminData.id),
        ),
      );

      // Process Graph Data
      if (graphSnapshot) {
        const allAtts = graphSnapshot.docs.map((doc) => doc.data());
        const rawGraphData = {};

        for (let i = 6; i >= 0; i--) {
          const dateObj = new Date();
          dateObj.setDate(dateObj.getDate() - i);
          const dateStr = dateObj.toLocaleDateString("en-CA");
          const displayStr = dateObj.toLocaleDateString("en-US", {
            weekday: "short",
          });
          rawGraphData[dateStr] = {
            displayDate: displayStr,
            date: dateStr,
            presentCount: new Set(),
          };
        }

        allAtts.forEach((att) => {
          if (att.type === "IN" && rawGraphData[att.date]) {
            rawGraphData[att.date].presentCount.add(att.employeeId);
          }
        });

        const finalGraphData = Object.values(rawGraphData).map((day) => {
          const present = day.presentCount.size;
          
          // Only count employees who existed on or before this day
          const activeEmployeesOnDay = emps.filter((emp) => {
            if (!emp.createdAt) return true;
            // Use en-CA for YYYY-MM-DD comparison
            const empDateStr = new Date(emp.createdAt).toLocaleDateString("en-CA");
            return empDateStr <= day.date;
          });

          const activeTotal = activeEmployeesOnDay.length;
          const absent = activeTotal > 0 ? Math.max(0, activeTotal - present) : 0;
          const dayDate = new Date(day.date + "T00:00:00");

          return {
            name: day.displayDate,
            fullName: format(dayDate, "EEEE"),
            fullDate: format(dayDate, "MMMM do, yyyy"),
            Present: present,
            Absent: absent,
            Total: activeTotal,
            presentPercent: activeTotal > 0 ? (present / activeTotal) * 100 : 0,
            date: day.date,
          };
        });
        setWeeklyData(finalGraphData);
      }
    } catch (error) {
      console.error("General error in fetchInitialData:", error);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    if (adminData?.id) {
      fetchInitialData();
      fetchSettings();
    }
  }, [adminData]);

  useEffect(() => {
    if (!adminData?.id) return;

    // 1. Real-time today's attendance (Handled date in JS to avoid index requirements)
    const qToday = query(
      collection(db, "attendance"),
      where("adminId", "==", adminData.id),
    );

    const unsubscribeToday = onSnapshot(
      qToday,
      (snapshot) => {
        const atts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const todayAtts = atts.filter((a) => a.date === todayString);
        todayAtts.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setTodayAttendances(todayAtts);
      },
      (err) => console.error("qToday error:", err),
    );

    // 2. Real-time recent activity (Handled in JS to avoid index requirements)
    const qRecent = query(
      collection(db, "attendance"),
      where("adminId", "==", adminData.id),
    );

    const unsubscribeRecent = onSnapshot(qRecent, (snapshot) => {
      // Fetch all for today/recent and sort/limit in JS
      const logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setRecentActivity(logs.slice(0, 10)); // Keep only latest 10
    });

    return () => {
      unsubscribeToday();
      unsubscribeRecent();
    };
  }, [adminData?.id, db, todayString]);

  useEffect(() => {
    if (adminData?.id) {
      setRecordsLoading(true);
      const qRecords = query(
        collection(db, "attendance"),
        where("adminId", "==", adminData.id),
      );

      const unsubscribeRecords = onSnapshot(
        qRecords,
        (snapshot) => {
          const atts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          atts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          setRawRecordsAttendances(atts);
          setRecordsLoading(false);
        },
        (err) => {
          console.error("Records listener error:", err);
          setRecordsLoading(false);
        },
      );

      return () => unsubscribeRecords();
    }
  }, [activeTab, adminData?.id, db]);

  const openManualPunchModal = (emp) => {
    setManualPunchEmp(emp);

    // 1. Gather all unique records from both real-time streams
    const combinedLogs = [...todayAttendances, ...rawRecordsAttendances];
    
    // 2. Filter specifically for this employee and sort by timestamp to find the absolute latest
    const empLogs = combinedLogs
      .filter(log => log.employeeId === emp.id)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const latestStatus = empLogs.length > 0 ? empLogs[0].type : null;
    const latestDate = empLogs.length > 0 ? empLogs[0].date : todayString;

    // 3. Automated Toggle:
    // If they are currently "IN", the next action MUST be "OUT".
    const nextType = (latestStatus === "IN") ? "OUT" : "IN";

    setManualPunchType(nextType);

    // SMARTER DATE DEFAULT: If they forgot to check out on a PREVIOUS day, 
    // default the modal to THAT date to fix the record properly.
    if (latestStatus === "IN" && latestDate !== todayString) {
      setManualPunchDate(latestDate);
    } else {
      setManualPunchDate(todayString);
    }
    const now = new Date();
    setManualPunchTime(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    setIsManualPunchOpen(true);
  };

  const handleManualPunchSubmit = async (e) => {
    e.preventDefault();
    if (!manualPunchEmp || !manualPunchDate || !manualPunchTime) return;
    setSaving(true);
    try {
      const dateTimeString = `${manualPunchDate}T${manualPunchTime}`;
      const punchDateObj = new Date(dateTimeString);

      const newAttendance = {
        adminId: adminData.id,
        employeeId: manualPunchEmp.id,
        employeeName: manualPunchEmp.name,
        type: manualPunchType,
        date: manualPunchDate,
        time: punchDateObj.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        timestamp: punchDateObj.getTime(),
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "attendance"), newAttendance);
      setIsManualPunchOpen(false);
    } catch (error) {
      console.error("Error adding manual punch:", error);
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = () => {
    setEditingEmpId(null);
    setEmpName("");
    setEmpId("");
    setPin("");
    setRole("Employee");
    setIsEmpModalOpen(true);
  };
  const openEditModal = (emp) => {
    setEditingEmpId(emp.id);
    setEmpName(emp.name || "");
    setEmpId(emp.empId || "");
    setPin(emp.pin || "");
    setRole(emp.role || "Employee");
    setIsEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!empName || !empId || !pin) return;
    setSaving(true);
    try {
      const formattedEmpId = empId.toLowerCase().trim();
      
      // Check for global uniqueness across ALL databases
      const snapAdmins = await getDocs(collection(centralDb, "admins"));
      let existsGlobally = false;

      for (const adminDoc of snapAdmins.docs) {
        const adminDataDoc = { id: adminDoc.id, ...adminDoc.data() };
        const adminConfig = adminDataDoc.firebaseConfig;
        
        let targetDb = db; // default to current db
        if (adminConfig && adminConfig.apiKey) {
           targetDb = getAdminFirestore(adminConfig);
        }

        const q = query(collection(targetDb, "employees"), where("empId", "==", formattedEmpId));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          const exists = snap.docs.some((docSnap) => {
             // It's a duplicate if it's not the exact same document we are editing right now
             // (We must ensure it's in our own DB and matches the editingEmpId to allow self-updates)
             if (targetDb === db && docSnap.id === editingEmpId) {
                return false; 
             }
             return true;
          });
          
          if (exists) {
            existsGlobally = true;
            break;
          }
        }
      }

      if (existsGlobally) {
        alert("This Employee ID already exists in the system! Please provide a globally unique ID.");
        setSaving(false);
        return;
      }

      const data = {
        name: empName,
        empId: formattedEmpId,
        pin,
        role,
        adminId: adminData.id,
      };

      if (editingEmpId) {
        await updateDoc(doc(db, "employees", editingEmpId), data);
      } else {
        await addDoc(collection(db, "employees"), {
          ...data,
          createdAt: new Date().toISOString(),
        });
      }
      setIsEmpModalOpen(false);
      fetchInitialData();
    } catch (err) {
      console.error("Error saving employee:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttendance = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this attendance log?")) {
      try {
        await deleteDoc(doc(db, "attendance", id));
        fetchInitialData();
      } catch (err) {
        console.error("Error deleting attendance: ", err);
        alert("Failed to delete attendance record.");
      }
    }
  };

  const openEditAttendanceModal = (rec) => {
    setEditingAttendance(rec);
    setEditAttDate(rec.date);
    const dateObj = new Date(rec.timestamp);
    const hours = dateObj.getHours().toString().padStart(2, "0");
    const mins = dateObj.getMinutes().toString().padStart(2, "0");
    setEditAttTime(`${hours}:${mins}`);
    setIsEditAttendanceOpen(true);
  };

  const handleSaveAttendance = async (e) => {
    e.preventDefault();
    if (!editingAttendance || !editAttDate || !editAttTime) return;
    setSaving(true);
    try {
      const dateTimeString = `${editAttDate}T${editAttTime}`;
      const punchDateObj = new Date(dateTimeString);

      const updatedData = {
        date: editAttDate,
        time: punchDateObj.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        timestamp: punchDateObj.getTime(),
      };

      await updateDoc(doc(db, "attendance", editingAttendance.id), updatedData);
      setIsEditAttendanceOpen(false);
    } catch (err) {
      console.error("Error updating attendance:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await setDoc(doc(db, "companySettings", "timing"), companySettings);
      alert("Company settings updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDeleteEmployee = async (id) => {
    if (
      window.confirm(
        "Are you sure you want to delete this employee? ALL attendance logs for this employee will also be permanently deleted.",
      )
    ) {
      try {
        // Find and delete all attendance records for this specific employee
        const qAttendance = query(
          collection(db, "attendance"),
          where("adminId", "==", adminData.id),
        );
        const attSnap = await getDocs(qAttendance);
        const employeeLogs = attSnap.docs.filter(
          (att) => att.data().employeeId === id,
        );

        // Execute all deletions in parallel
        await Promise.all([
          ...employeeLogs.map((att) =>
            deleteDoc(doc(db, "attendance", att.id)),
          ),
          deleteDoc(doc(db, "employees", id)),
        ]);

        // Refresh all relevant states
        fetchInitialData();
      } catch (error) {
        console.error(error);
        alert("Deletion failed. Please check your connection.");
      }
    }
  };

  const latestStatuses = {};
  todayAttendances.forEach((a) => {
    latestStatuses[a.employeeId] = a.type;
  });
  const presentsTodayCount = Object.values(latestStatuses).filter(
    (type) => type === "IN",
  ).length;
  const absentsTodayCount = employees.length - presentsTodayCount;
  const todayPresentPercent =
    employees.length > 0 ? (presentsTodayCount / employees.length) * 100 : 0;

  // FIND EMPLOYEES WHO FORGOT TO CHECK OUT (STUCK IN PREVIOUS DAYS)
  const stuckEmployees = employees.filter(emp => {
    const empLogs = rawRecordsAttendances.filter(l => l.employeeId === emp.id);
    if (empLogs.length === 0) return false;
    const latest = [...empLogs].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    return latest.type === "IN" && latest.date !== todayString;
  });

  const formatTimeAMPM = (timeStr) => {
    if (!timeStr) return "--:--";
    const [h, m] = timeStr.split(':');
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
  };

  return (
    <div className="admin-dashboard-layout">
      {/* MOBILE TOPBAR (Hidden on Desktop) */}
      <div className="mobile-topbar">
        <h2>{adminData.adminName}</h2>
        <button
          className="hamburger-btn"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* MOBILE OVERLAY */}
      <div
        className={`sidebar-overlay ${isMobileSidebarOpen ? "open" : ""}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      ></div>

      {/* SIDEBAR */}
      <div className={`sidebar ${isMobileSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              padding: "15px 0",
              textAlign: "center",
            }}
          >
            {adminData.logoUrl ? (
              <img
                src={adminData.logoUrl}
                alt="Logo"
                style={{
                  width: "60%",
                  maxHeight: "60px",
                  objectFit: "contain",
                }}
              />
            ) : (
              <h2
                style={{
                  margin: 0,
                  color: "#fff",
                  fontSize: "1.4rem",
                  fontWeight: "800",
                }}
              >
                {adminData.adminName}
              </h2>
            )}
          </div>
          <button
            className="close-sidebar-btn"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="nav-menu">
          <button
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("dashboard");
              setIsMobileSidebarOpen(false);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
            Dashboard
          </button>
          <button
            className={`nav-item ${activeTab === "employees" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("employees");
              setIsMobileSidebarOpen(false);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Employees
          </button>
          <button
            className={`nav-item ${activeTab === "records" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("records");
              setIsMobileSidebarOpen(false);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Attendance Logs
          </button>
          
          <button
            className={`nav-item ${activeTab === "calendar" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("calendar");
              setIsMobileSidebarOpen(false);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Calendar
          </button>
          
          <button
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              setIsMobileSidebarOpen(false);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </button>
        </div>
        <div className="sidebar-footer">
          <button onClick={onLogout} className="logout-btn-admin">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        {/* OVERVIEW TAB */}
        {activeTab === "dashboard" && (
          <div>
            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
              </div>
            ) : (
              <>
                {/* Instant Detailed Cards */}
                <div className="stats-header-grid">
                  {/* Total Card */}
                  <div
                    className="stat-card blue-grad"
                    style={{ cursor: "pointer" }}
                    onClick={() => openQuickView("ALL EMPLOYEES", employees)}
                  >
                    <div className="stat-header">
                      <span className="stat-label">Total Employees</span>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stat-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    </div>
                    <div className="stat-value">{employees.length}</div>
                    <div className="stat-footer">View manage list</div>
                  </div>

                  {/* Present Card */}
                  <div
                    className="stat-card green-grad"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      const presentList = employees.filter(e => latestStatuses[e.id] === "IN");
                      openQuickView("PRESENT TODAY", presentList);
                    }}
                  >
                    <div className="stat-header">
                      <span className="stat-label">Present Today</span>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stat-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
                    </div>
                    <div className="stat-value">{presentsTodayCount}</div>
                    <div className="stat-footer">View active staff</div>
                  </div>

                  {/* Absent Card */}
                  <div
                    className="stat-card red-grad"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      const absentList = employees.filter(e => latestStatuses[e.id] !== "IN");
                      openQuickView("ABSENT TODAY", absentList);
                    }}
                  >
                    <div className="stat-header">
                      <span className="stat-label">Absent Today</span>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stat-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>
                    </div>
                    <div className="stat-value">{absentsTodayCount}</div>
                    <div className="stat-footer">View staff records</div>
                  </div>

                  {/* Present Today % Card */}
                  <div
                    className="stat-card purple-grad"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      const presentList = employees.filter(e => latestStatuses[e.id] === "IN");
                      openQuickView("PRESENT TODAY", presentList);
                    }}
                  >
                    <div className="stat-header">
                      <span className="stat-label">Present Today %</span>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stat-icon"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                    </div>
                    <div className="stat-value">{Math.round(todayPresentPercent)}%</div>
                    <div className="stat-footer">Daily engagement rate</div>
                  </div>
                </div>


                {/* Instant progress section removed as per request */}
                <div className="overview-subgrid">
                  {/* Weekly Trend Quick Bars */}
                  <div className="content-card trend-card">
                    <h2>Weekly Presence Trend</h2>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        height: "180px",
                        gap: "12px",
                        paddingBottom: "10px",
                        borderBottom: "1px solid #E5E7EB",
                      }}
                    >
                      {weeklyData.map((day) => (
                        <div
                          key={day.date}
                          className="trend-bar-container"
                          onClick={() => setTrendDetailModal({ open: true, day })}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            height: "100%",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              color: "var(--apple-orange-base)",
                              fontSize: "12px",
                              fontWeight: 700,
                              marginBottom: "6px",
                            }}
                          >
                            {day.Present}
                          </div>
                          <div
                            className="trend-bar"
                            style={{
                              width: "100%",
                              maxWidth: "36px",
                              height: `${Math.max(day.presentPercent, 2)}%`,
                              background:
                                day.Present === 0
                                  ? "var(--apple-orange-soft)"
                                  : "linear-gradient(to top, var(--apple-orange-base), var(--apple-orange-vibrant))",
                              borderRadius: "6px 6px 0 0",
                              position: "relative",
                              transition: "all 0.3s ease",
                            }}
                          ></div>
                        </div>
                      ))}
                    </div>

                    {/* X Axis Labels */}
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        marginTop: "12px",
                      }}
                    >
                      {weeklyData.map((day) => (
                        <div
                          key={day.date}
                          onClick={() => setTrendDetailModal({ open: true, day })}
                          style={{
                            flex: 1,
                            textAlign: "center",
                            fontSize: "12px",
                            color: "var(--apple-grey-text)",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {day.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent Activity Mini-Feed */}
                <div className="content-card" style={{ marginTop: "30px" }}>
                  <div className="card-header-flex">
                    <h2 style={{ fontSize: "20px", color: "var(--apple-black)" }}>
                      Recent Activity Feed
                    </h2>
                    <button
                      className="text-link-btn"
                      onClick={() => setActiveTab("records")}
                    >
                      View All
                    </button>
                  </div>
                  <div className="recent-list">
                    {recentActivity.length === 0 ? (
                      <div className="loading-text">
                        No activity recorded yet.
                      </div>
                    ) : (
                      recentActivity.map((log) => {
                        const emp = employees.find(
                          (e) => e.id === log.employeeId,
                        );
                        const time = new Date(log.timestamp).toLocaleString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        );
                        return (
                          <div key={log.id} className="activity-item">
                            <div className="activity-left">
                              <div
                                className={`activity-icon ${log.type === "IN" ? "in-bg" : "out-bg"}`}
                              >
                                {log.type === "IN" ? "↓" : "↑"}
                              </div>
                              <div className="activity-info">
                                <span className="activity-emp">
                                  {emp ? emp.name : "Unknown Employee"}
                                </span>
                                <span className="activity-type">
                                  Checked {log.type}
                                </span>
                              </div>
                            </div>
                            <div className="activity-right">{time}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* EMPLOYEE MANAGEMENT TAB */}
        {activeTab === "employees" && (
          <div>
            <div className="content-card">
              <div className="card-header-flex">
                <h2>Manage Staff</h2>
                <div className="search-filter-container">
                  <div className="search-input-wrapper">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="search-icon"
                    >
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input
                      type="text"
                      className="emp-search-input"
                      placeholder="Search name, id, or role..."
                      value={empDirectorySearchTerm}
                      onChange={(e) =>
                        setEmpDirectorySearchTerm(e.target.value)
                      }
                    />
                  </div>
                  <button
                    className="primary-btn icon-only"
                    onClick={openAddModal}
                    title="Add New Employee"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <div className="loading-label">Loading employees...</div>
                </div>
              ) : employees.length === 0 ? (
                <div className="loading-text">No employees yet.</div>
              ) : (
                (() => {
                  const filteredDirectoryEmployees = employees.filter((emp) => {
                    if (!empDirectorySearchTerm) return true;
                    const term = empDirectorySearchTerm.toLowerCase();
                    const nameMatch = emp.name?.toLowerCase().includes(term);
                    const idMatch = emp.empId?.toLowerCase().includes(term);
                    const roleMatch = emp.role?.toLowerCase().includes(term);
                    return nameMatch || idMatch || roleMatch;
                  });

                  if (filteredDirectoryEmployees.length === 0) {
                    return (
                      <div className="loading-text">
                        No employees found matching your search.
                      </div>
                    );
                  }

                  return (
                    <div className="item-grid">
                      {filteredDirectoryEmployees.map((emp) => (
                        <div key={emp.id} className="item-card">
                          <div className="card-actions-admin">
                            <button
                              className="icon-btn"
                              style={{
                                color: "#059669",
                                background: "rgba(16, 185, 129, 0.1)",
                              }}
                              onClick={() => openManualPunchModal(emp)}
                              title="Log Time"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                              </svg>
                            </button>
                            <button
                              className="icon-btn edit-btn"
                              onClick={() => openEditModal(emp)}
                              title="Edit Employee"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button
                              className="icon-btn delete-btn"
                              onClick={() => handleDeleteEmployee(emp.id)}
                              title="Delete Employee"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                          <h3>{emp.name}</h3>
                          <span className="item-role">{emp.role}</span>
                          <div className="item-detail">
                            <span className="label">Emp ID:</span>
                            <span className="value">{emp.empId}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* RECORDS TAB */}
        {activeTab === "records" && (
          <div>
            <div className="page-header records-header">
              <h1>Attendance Logs</h1>
              <div className="search-filter-container">
                {/* Embedded Search Bar */}
                <div className="search-input-wrapper">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="search-icon"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input
                    type="text"
                    className="emp-search-input"
                    placeholder="Search employee..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {/* Filter Icon Button */}
                <button
                  className={`filter-toggle-btn ${showFilters || selectedDate || filterAction || startTime || endTime ? "active" : ""}`}
                  onClick={() => setShowFilters(true)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                  <span className="hide-on-mobile">Filter</span>
                </button>
              </div>
            </div>

            {/* ACTIVE FILTERS DISPLAY */}
            {(selectedDate || filterAction || startTime || endTime) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "20px",
                }}
              >
                {selectedDate && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "var(--apple-orange-soft)",
                      color: "var(--apple-orange-deep)",
                      padding: "6px 12px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: "600",
                      border: "1px solid var(--apple-orange-base)",
                    }}
                  >
                    <span>Date: {selectedDate}</span>
                    <button
                      onClick={() => setSelectedDate("")}
                      style={{
                        background: "none",
                        border: "none",
                        marginLeft: "6px",
                        cursor: "pointer",
                        color: "var(--apple-orange-deep)",
                        display: "flex",
                        alignItems: "center",
                        padding: "2px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {(startTime || endTime) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "var(--apple-orange-soft)",
                      color: "var(--apple-orange-deep)",
                      padding: "6px 12px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: "600",
                      border: "1px solid var(--apple-orange-base)",
                    }}
                  >
                    <span>
                      Time: {startTime || "--:--"} to {endTime || "--:--"}
                    </span>
                    <button
                      onClick={() => {
                        setStartTime("");
                        setEndTime("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        marginLeft: "6px",
                        cursor: "pointer",
                        color: "var(--apple-grey-text)",
                        display: "flex",
                        alignItems: "center",
                        padding: "2px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                {filterAction && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "var(--apple-orange-soft)",
                      color: "var(--apple-orange-deep)",
                      padding: "6px 12px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: "600",
                      border: "1px solid var(--apple-orange-base)",
                    }}
                  >
                    <span>Action: {filterAction}</span>
                    <button
                      onClick={() => setFilterAction("")}
                      style={{
                        background: "none",
                        border: "none",
                        marginLeft: "6px",
                        cursor: "pointer",
                        color: "var(--apple-grey-text)",
                        display: "flex",
                        alignItems: "center",
                        padding: "2px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    setSelectedDate("");
                    setFilterAction("");
                    setStartTime("");
                    setEndTime("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#DC2626",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    padding: "6px 12px",
                  }}
                >
                  Clear All
                </button>
              </div>
            )}
            <div className="content-card" style={{ padding: "0" }}>
              {recordsLoading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <div className="loading-label">Scanning history...</div>
                </div>
              ) : recordsAttendances.length === 0 ? (
                <div className="loading-text">
                  No attendance records found for {selectedDate}.
                </div>
              ) : (
                <div className="records-viewport">
                  {/* Desktop Table View */}
                  <table className="desktop-records-table">
                    <thead>
                      <tr>
                        <th style={{ width: "120px" }}>DATE</th>
                        <th style={{ width: "140px" }}>TIME</th>
                        <th>EMPLOYEE</th>
                        <th style={{ textAlign: "center", width: "160px" }}>STATUS</th>
                        <th style={{ textAlign: "center", width: "120px" }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordsAttendances.map((rec) => {
                        const empObj = employees.find(
                          (e) => e.id === rec.employeeId,
                        );
                        const dateObj = new Date(rec.timestamp);
                        return (
                          <tr 
                            key={rec.id}
                            onClick={() => handleEmployeeClick(rec.employeeId, empObj ? empObj.name : "Unknown Employee", rec.date)}
                            style={{ cursor: "pointer" }}
                            title="Click to view total hours worked"
                          >
                            <td className="date-cell" style={{ fontWeight: "500", color: "var(--apple-grey-text)" }}>
                              {dateObj.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </td>
                            <td className="time-cell">
                              {dateObj.toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </td>
                            <td className="name-cell" style={{ color: "var(--apple-orange-base)", fontWeight: "600" }}>
                              {empObj ? empObj.name : "Unknown Employee"}
                            </td>
                            <td className="action-cell" style={{ textAlign: "center" }}>
                              <span
                                className={`punch-tag ${rec.type === "IN" ? "in" : "out"}`}
                              >
                                {rec.type === "IN" ? "Checked IN" : "Checked OUT"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", justifyContent: "center", gap: "2px" }}>
                                <button
                                  className="icon-btn edit-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditAttendanceModal(rec);
                                  }}
                                  title="Edit Record Time"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  className="icon-btn delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAttendance(rec.id);
                                  }}
                                  title="Delete Record"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Card List View */}
                  <div className="mobile-records-list">
                    {recordsAttendances.map((rec) => {
                      const empObj = employees.find(
                        (e) => e.id === rec.employeeId,
                      );
                      const dateObj = new Date(rec.timestamp);
                      return (
                        <div 
                          key={rec.id} 
                          className="mobile-record-card"
                          onClick={() => handleEmployeeClick(rec.employeeId, empObj ? empObj.name : "Unknown Employee", rec.date)}
                          style={{ cursor: "pointer" }}
                        >
                          <div className="card-top">
                            <span className="card-name" style={{ color: "var(--apple-orange-base)" }}>
                              {empObj ? empObj.name : "Unknown Employee"}
                            </span>
                            <span
                              className={`punch-tag ${rec.type === "IN" ? "in" : "out"}`}
                            >
                              {rec.type}
                            </span>
                          </div>
                          <div className="card-bottom">
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <span className="card-time">
                                {dateObj.toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <button
                                className="icon-btn"
                                style={{ color: "var(--apple-orange-base)", padding: "0" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditAttendanceModal(rec);
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                              <button
                                className="icon-btn"
                                style={{ color: "#EF4444", padding: "0", marginLeft: "6px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAttendance(rec.id);
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                            <span className="card-timestamp">
                              {dateObj.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === "calendar" && (
          <div>
            <div className="page-header records-header">
              <h1>Attendance Calendar</h1>
            </div>
            <div className="content-card">
              <div className="calendar-header-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <button className="icon-btn" onClick={() => setCalendarCurrentDate(subMonths(calendarCurrentDate, 1))}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "600", color: "#1E293B" }}>
                  {format(calendarCurrentDate, "MMMM yyyy")}
                </h2>
                <button className="icon-btn" onClick={() => setCalendarCurrentDate(addMonths(calendarCurrentDate, 1))}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>

              <div className="calendar-grid-wrapper">
                <div className="calendar-grid">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                    <div key={d} className="calendar-day-name">{d}</div>
                  ))}
                  {calendarDays.map((dayObj, i) => {
                    const isCurrentMonth = isSameMonth(dayObj, calendarCurrentDate);
                    const isSelectedToday = isSameDay(dayObj, new Date());
                    const dayStr = format(dayObj, "yyyy-MM-dd");
                    
                    let presentCount = 0;
                    if (isCurrentMonth) {
                      const dayRecords = rawRecordsAttendances.filter(r => r.date === dayStr);
                      const presentSet = new Set();
                      dayRecords.forEach(r => {
                         if (r.type === "IN") presentSet.add(r.employeeId);
                      });
                      presentCount = presentSet.size;
                    }
                    const activeEmployees = employees.filter((emp) => {
                      if (!emp.createdAt) return true;
                      const empDateStr = new Date(emp.createdAt).toLocaleDateString("en-CA");
                      return empDateStr <= dayStr;
                    });
                    const total = activeEmployees.length;
                    const isPastOrToday = dayObj <= new Date();

                    return (
                      <div 
                        key={i} 
                        className={`calendar-cell ${isCurrentMonth ? "current-month" : "other-month"} ${isSelectedToday ? "today" : ""}`}
                        onClick={() => {
                          if (isCurrentMonth) {
                            setSelectedDate(dayStr);
                            setActiveTab("records");
                          }
                        }}
                      >
                        <div className="calendar-date-number">
                          {format(dayObj, "d")}
                        </div>
                        {isCurrentMonth && isPastOrToday && total > 0 && (
                          <div className="calendar-day-stats">
                            <div className="stat-pill stat-pill-present">
                              <span className="stat-count">{presentCount}</span>
                              <span className="stat-label-present"></span>
                            </div>
                            <div className="stat-pill stat-pill-absent">
                              <span className="stat-count">{total - presentCount}</span>
                              <span className="stat-label-absent"></span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="settings-tab-container">
            <div className="page-header records-header">
              <h1>Company Settings</h1>
            </div>
            
            <div className="content-card settings-card">
              <form onSubmit={handleSaveSettings}>
                <div className="settings-section">
                  <div className="settings-header-group">
                    <div className="settings-icon-circle">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--apple-orange-base)" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <h3 className="settings-title">Office Timing Policy</h3>
                        <div className="current-settings-badge">
                          <span>{formatTimeAMPM(companySettings.checkInTime)} - {formatTimeAMPM(companySettings.checkOutTime)}</span>
                        </div>
                      </div>
                      <p className="settings-description">
                        Define standard work hours for automatic shift management.
                      </p>
                    </div>
                  </div>
                  
                  <div className="settings-grid">
                    <div className="form-group-admin">
                      <label>Standard Check-in Time</label>
                      <div className="time-input-wrapper">
                        <input 
                          type="time" 
                          value={companySettings.checkInTime}
                          onChange={(e) => setCompanySettings({...companySettings, checkInTime: e.target.value})}
                          required
                          className="modal-input-admin"
                        />
                        <div className="time-icon-suffix">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                        </div>
                      </div>
                      <span className="input-hint">Earliest expected arrival</span>
                    </div>
                    
                    <div className="form-group-admin">
                      <label>Standard Check-out Time</label>
                      <div className="time-input-wrapper">
                        <input 
                          type="time" 
                          value={companySettings.checkOutTime}
                          onChange={(e) => setCompanySettings({...companySettings, checkOutTime: e.target.value})}
                          required
                          className="modal-input-admin"
                        />
                        <div className="time-icon-suffix">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                        </div>
                      </div>
                      <span className="input-hint">Default shift end time</span>
                    </div>
                  </div>
                </div>

                <div className="settings-footer">
                  <button type="submit" className="primary-btn settings-submit-btn" disabled={settingsSaving}>
                    {settingsSaving ? "Updating..." : "Save Company Timings"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* EMP MODAL */}
      {isEmpModalOpen && (
        <div
          className="modal-overlay"
          onMouseDown={() => setIsEmpModalOpen(false)}
        >
          <div
            className="modal-content-admin"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header-admin">
              <h2>{editingEmpId ? "Edit Employee" : "Add Employee"}</h2>
              <button
                className="close-btn-admin"
                onClick={() => setIsEmpModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form className="emp-form" onSubmit={handleSaveEmployee}>
              <div className="input-group">
                <label>Name</label>
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label>Employee ID</label>
                <input
                  type="text"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label>Login PIN (4-digits recommended)</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                    style={{ paddingRight: "45px" }}
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() => setShowPin(!showPin)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      color: "var(--apple-grey-text)",
                    }}
                  >
                    {showPin ? (
                      <svg
                        width="18"
                        height="18"
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
                        width="18"
                        height="18"
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
              <div className="input-group">
                <label>Designation / Role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="submit-btn-admin"
                disabled={saving}
              >
                {" "}
                {saving ? "Saving..." : "Save"}{" "}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FILTER MODAL */}
      {showFilters && (
        <div
          className="modal-overlay"
          onMouseDown={() => setShowFilters(false)}
        >
          <div
            className="modal-content-admin"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ maxWidth: "420px" }}
          >
            <div className="modal-header-admin">
              <h2>Filter Logs</h2>
              <button
                className="close-btn-admin"
                onClick={() => setShowFilters(false)}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    color: "#374151",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Date
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="date"
                    className="styled-date-time"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    max={todayString}
                  />
                  <svg
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--apple-black)",
                    }}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    color: "#374151",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Time Range
                </label>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type="time"
                      className="styled-date-time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                    <svg
                      style={{
                        position: "absolute",
                        right: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                        color: "var(--apple-black)",
                      }}
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <span style={{ color: "#94A3B8" }}>to</span>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type="time"
                      className="styled-date-time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                    <svg
                      style={{
                        position: "absolute",
                        right: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        pointerEvents: "none",
                        color: "var(--apple-black)",
                      }}
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    color: "#374151",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Action Type
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    className="styled-select"
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                  >
                    <option value="">All Actions</option>
                    <option value="IN">Check IN</option>
                    <option value="OUT">Check OUT</option>
                  </select>
                  <svg
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--apple-black)",
                    }}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
                <button
                  onClick={() => {
                    setSelectedDate("");
                    setFilterAction("");
                    setStartTime("");
                    setEndTime("");
                    setShowFilters(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "14px",
                    background: "#FEE2E2",
                    color: "#DC2626",
                    border: "none",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "15px",
                  }}
                >
                  Clear Filters
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  style={{
                    flex: 1,
                    padding: "14px",
                    background: "var(--apple-orange-base)",
                    color: "white",
                    border: "none",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "15px",
                  }}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL PUNCH MODAL */}
      {isManualPunchOpen && (
        <div
          className="modal-overlay"
          onMouseDown={() => setIsManualPunchOpen(false)}
        >
          <div
            className="modal-content-admin"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header-admin">
              <h2>Manual Time Log</h2>
              <button
                className="close-btn-admin"
                onClick={() => setIsManualPunchOpen(false)}
              >
                ✕
              </button>
            </div>
            <form
              className="emp-form manual-punch-form"
              onSubmit={handleManualPunchSubmit}
            >
              <div className="input-group">
                <label>Employee Name</label>
                <input
                  type="text"
                  value={manualPunchEmp?.name || ""}
                  disabled
                  style={{ background: "var(--apple-orange-soft)" }}
                />
              </div>
              <div className="input-group">
                <label>Action Type</label>
                <input
                  type="text"
                  value={manualPunchType === "IN" ? "Check IN" : "Check OUT"}
                  disabled
                  style={{
                    background: "var(--apple-orange-soft)",
                    color: manualPunchType === "IN" ? "#059669" : "#D97706",
                    fontWeight: "700",
                  }}
                />
              </div>
              <div className="input-group">
                <label>Date</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="date"
                    className="styled-date-time"
                    value={manualPunchDate}
                    onChange={(e) => setManualPunchDate(e.target.value)}
                    required
                  />
                  <svg
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--apple-black)",
                    }}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
              </div>
              <div className="input-group">
                <label>Time</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="time"
                    className="styled-date-time"
                    value={manualPunchTime}
                    onChange={(e) => setManualPunchTime(e.target.value)}
                    required
                  />
                  <svg
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--apple-black)",
                    }}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn-admin"
                disabled={saving}
              >
                {saving ? "Saving..." : "Log Time"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ATTENDANCE MODAL */}
      {isEditAttendanceOpen && (
        <div
          className="modal-overlay"
          onMouseDown={() => setIsEditAttendanceOpen(false)}
        >
          <div
            className="modal-content-admin"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header-admin">
              <h2>Edit Time Log</h2>
              <button
                className="close-btn-admin"
                onClick={() => setIsEditAttendanceOpen(false)}
              >
                ✕
              </button>
            </div>
            <form
              className="emp-form manual-punch-form"
              onSubmit={handleSaveAttendance}
            >
              <div className="input-group">
                <label>Employee Name</label>
                <input
                  type="text"
                  value={employees.find(e => e.id === editingAttendance?.employeeId)?.name || "Unknown Employee"}
                  disabled
                  style={{ background: "var(--apple-orange-soft)" }}
                />
              </div>
              <div className="input-group">
                <label>Action Type</label>
                <input
                  type="text"
                  value={
                    editingAttendance?.type === "IN" ? "Check IN" : "Check OUT"
                  }
                  disabled
                  style={{
                    background: "var(--apple-orange-soft)",
                    color:
                      editingAttendance?.type === "IN" ? "#059669" : "#D97706",
                    fontWeight: "700",
                  }}
                />
              </div>
              <div className="input-group">
                <label>Date</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="date"
                    className="styled-date-time"
                    value={editAttDate}
                    onChange={(e) => setEditAttDate(e.target.value)}
                    required
                  />
                  <svg
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--apple-black)",
                    }}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
              </div>
              <div className="input-group">
                <label>Time</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="time"
                    className="styled-date-time"
                    value={editAttTime}
                    onChange={(e) => setEditAttTime(e.target.value)}
                    required
                  />
                  <svg
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--apple-black)",
                    }}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn-admin"
                disabled={saving}
              >
                {saving ? "Updating..." : "Update Record"}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* QUICK VIEW MODAL */}
      {quickViewModal.open && (
        <div className="modal-overlay" onClick={() => setQuickViewModal({ ...quickViewModal, open: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '16px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {quickViewModal.title}
              </h2>
              <button className="close-modal-btn" onClick={() => setQuickViewModal({ ...quickViewModal, open: false })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {quickViewModal.employees.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--apple-grey-text)', padding: '20px' }}>No records found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {quickViewModal.employees.map(emp => (
                    <div key={emp.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: 'var(--apple-orange-soft)',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <span style={{ fontWeight: '700', color: '#1e293b', textTransform: 'uppercase', fontSize: '13px' }}>{emp.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--apple-grey-text)', fontWeight: '600', textTransform: 'uppercase', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>
                        {emp.role || 'Staff'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
               <button 
                className="submit-btn" 
                style={{ margin: 0, padding: '10px 20px', width: 'auto', fontSize: '14px' }}
                onClick={() => setQuickViewModal({ ...quickViewModal, open: false })}
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}
      {/* HOURS WORKED MODAL */}
      {hoursWorkedModal.open && (
        <div className="modal-overlay" onMouseDown={() => setHoursWorkedModal({ ...hoursWorkedModal, open: false })}>
          <div className="modal-content-admin" style={{ maxWidth: '360px', textAlign: 'center' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header-admin">
              <h2>Work Hours</h2>
              <button className="close-btn-admin" onClick={() => setHoursWorkedModal({ ...hoursWorkedModal, open: false })}>
                ✕
              </button>
            </div>
            <div style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '60px', height: '60px', background: 'var(--apple-orange-soft)', color: 'var(--apple-orange-base)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', color: 'var(--apple-black)', fontSize: '18px' }}>{hoursWorkedModal.empName}</h3>
                  <span style={{ color: 'var(--apple-grey-text)', fontSize: '13px', fontWeight: '500' }}>Date: {hoursWorkedModal.dateStr}</span>
                </div>
                
                <div style={{ background: 'var(--apple-orange-soft)', border: '1px solid var(--apple-orange-base)', padding: '20px', borderRadius: '12px', width: '100%', boxSizing: 'border-box' }}>
                  {hoursWorkedModal.isStillNotCheckedOut ? (
                    <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--apple-orange-deep)', lineHeight: '1.2' }}>
                       Still Not Checked Out
                    </div>
                  ) : (
                    <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--apple-black)', lineHeight: '1' }}>
                       {hoursWorkedModal.hours}<span style={{ fontSize: '16px', color: 'var(--apple-grey-text)', margin: '0 8px 0 4px' }}>h</span>
                       {hoursWorkedModal.mins}<span style={{ fontSize: '16px', color: 'var(--apple-grey-text)', marginLeft: '4px' }}>m</span>
                    </div>
                  )}
                </div>
            </div>
            <div style={{ padding: '16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'center' }}>
               <button 
                className="submit-btn-admin" 
                style={{ margin: 0, width: '100%' }}
                onClick={() => setHoursWorkedModal({ ...hoursWorkedModal, open: false })}
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}
      {/* TREND DETAIL MODAL */}
      {trendDetailModal.open && trendDetailModal.day && (
        <div className="modal-overlay" onMouseDown={() => setTrendDetailModal({ open: false, day: null })}>
          <div className="modal-content-admin" style={{ maxWidth: '400px' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header-admin">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ fontSize: '18px', marginBottom: '2px' }}>Attendance Details</h2>
                <span style={{ fontSize: '13px', color: 'var(--apple-grey-text)', fontWeight: '500' }}>{trendDetailModal.day.fullDate}</span>
              </div>
              <button className="close-btn-admin" onClick={() => setTrendDetailModal({ open: false, day: null })}>
                ✕
              </button>
            </div>
            
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Header with Day Name */}
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '32px', fontWeight: '800', color: '#1E293B' }}>{trendDetailModal.day.fullName}</div>
                </div>

                {/* Stats Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ background: 'var(--apple-orange-soft)', border: '1px solid var(--apple-orange-base)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--apple-orange-base)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Present</div>
                    <div style={{ color: 'var(--apple-orange-deep)', fontSize: '28px', fontWeight: '800' }}>{trendDetailModal.day.Present}</div>
                  </div>
                  <div style={{ background: '#FFF1F2', border: '1px solid #F43F5E33', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: '#E11D48', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Absent</div>
                    <div style={{ color: '#9F1239', fontSize: '28px', fontWeight: '800' }}>{trendDetailModal.day.Absent}</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', fontWeight: '600' }}>
                    <span style={{ color: 'var(--apple-grey-text)' }}>Attendance Rate</span>
                    <span style={{ color: 'var(--apple-orange-base)' }}>{Math.round(trendDetailModal.day.presentPercent)}%</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: 'var(--apple-orange-soft)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${trendDetailModal.day.presentPercent}%`, 
                      background: 'var(--apple-orange-gradient)',
                      borderRadius: '4px'
                    }}></div>
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--apple-grey-text)', textAlign: 'center' }}>
                    Total Staff: <strong>{trendDetailModal.day.Total}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '12px' }}>
               <button 
                className="submit-btn-admin" 
                style={{ 
                  margin: 0, 
                  flex: 1,
                  background: '#F8FAFC',
                  color: '#475569',
                  border: '1px solid #E2E8F0'
                }}
                onClick={() => setTrendDetailModal({ open: false, day: null })}
               >
                 Dismiss
               </button>
               <button 
                className="submit-btn-admin" 
                style={{ margin: 0, flex: 2 }}
                onClick={() => {
                  setSelectedDate(trendDetailModal.day.date);
                  setActiveTab("records");
                  setTrendDetailModal({ open: false, day: null });
                }}
               >
                 View Logs
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
