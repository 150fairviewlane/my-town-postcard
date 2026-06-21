import AdminNav from "./AdminNav";

const SIDEBAR_W = 220;

export default function AdminShell({ children }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <AdminNav />
      <div style={{
        flex: 1,
        marginLeft: SIDEBAR_W,
        minWidth: 0,
        fontFamily: "system-ui, sans-serif",
      }}>
        {children}
      </div>
    </div>
  );
}
