import { useState, useEffect } from "react";
import useSWR from "swr";
import { FolderOpen, Lock, Save, Mail, Send, Settings as SettingsIcon, Monitor, Shield, Globe, FileText, Eye } from "lucide-react";
import { api } from "../api/client";
import { CaptureSettings, SmtpConfig, LoggingConfig, VncConfig } from "../types";
import FolderPicker from "../components/FolderPicker";
import { useTranslation } from "../i18n/i18n";
import { formatPath, formatBytes } from "../utils/format";

const captureFetcher = () => api<CaptureSettings>("/api/settings/capture");
const securityFetcher = () => api<{ requireAuthentication: boolean; hasPassword: boolean }>("/api/settings/security");
const smtpFetcher = () => api<SmtpConfig>("/api/settings/mail");
const startupFetcher = () => api<{ enabled: boolean }>("/api/system/startup");
const adminStatusFetcher = () => api<{ isAdministrator: boolean }>("/api/system/admin/status");

type SettingsTab = "general" | "security" | "mail" | "logging" | "screenshots" | "vnc";

export default function Settings() {
  const { t, language, setLanguage } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // General Settings State
  const { data: captureData, mutate: mutateCapture } = useSWR("capture-settings", captureFetcher);
  const { data: startupData, mutate: mutateStartup } = useSWR("startup-status", startupFetcher);
  const { data: adminData, mutate: mutateAdmin } = useSWR("admin-status", adminStatusFetcher);

  const [captureForm, setCaptureForm] = useState<CaptureSettings>({
    folder: "",
    filenamePattern: "",
    enableIntervalCapture: false,
    intervalSeconds: 60
  });

  const [showPicker, setShowPicker] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Security Settings State
  const { data: securityData, mutate: mutateSecurity } = useSWR("security-settings", securityFetcher);
  const [securityForm, setSecurityForm] = useState({
    requireAuthentication: false,
    password: "",
    confirmPassword: ""
  });
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  // Mail Settings State
  const { data: smtpData, mutate: mutateSmtp } = useSWR("smtp-settings", smtpFetcher);
  const [smtpForm, setSmtpForm] = useState<SmtpConfig>({
    host: "smtp.gmail.com",
    port: 587,
    enableSsl: true,
    username: "",
    password: "",
    fromAddress: "",
    fromName: "Weasel Disk Monitor",
    testRecipient: ""
  });
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");

  // Initialize forms
  useEffect(() => {
    if (captureData) {
      setCaptureForm({
        folder: captureData.folder || "",
        filenamePattern: captureData.filenamePattern || "",
        enableIntervalCapture: false,
        intervalSeconds: 60
      });
    }
  }, [captureData]);

  useEffect(() => {
    if (securityData) {
      setSecurityForm((prev: any) => ({
        ...prev,
        requireAuthentication: securityData.requireAuthentication
      }));
    }
  }, [securityData]);

  useEffect(() => {
    if (smtpData) {
      setSmtpForm(smtpData);
      if (smtpData.testRecipient) setTestRecipient(smtpData.testRecipient);
    }
  }, [smtpData]);

  const saveGeneralSettings = async () => {
    setIsSavingGeneral(true);
    try {
      // Only save folder and filenamePattern, not interval settings
      await api("/api/settings/capture", {
        method: "PUT",
        body: JSON.stringify({
          folder: captureForm.folder,
          filenamePattern: captureForm.filenamePattern,
          enableIntervalCapture: captureData?.enableIntervalCapture || false,
          intervalSeconds: captureData?.intervalSeconds || 60
        })
      });
      await mutateCapture();
      showToast(t("common.success"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const toggleStartup = async (enabled: boolean) => {
    try {
      await api("/api/system/startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      await mutateStartup();
      showToast(t("common.success"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  const restartAsAdmin = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Restart as Administrator",
      message: t("system.restartAdmin") + "?",
      onConfirm: async () => {
        try {
          await api("/api/system/admin/restart", { method: "POST" });
          showToast("Restarting as administrator...", "success");
        } catch (error) {
          showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
        } finally {
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }
      },
      variant: "warning"
    });
  };

  const saveSecuritySettings = async () => {
    if (securityForm.password !== securityForm.confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }
    setIsSavingSecurity(true);
    try {
      await api("/api/settings/security", {
        method: "PUT",
        body: JSON.stringify({
          requireAuthentication: securityForm.requireAuthentication,
          password: securityForm.password || null
        })
      });
      setSecurityForm(prev => ({ ...prev, password: "", confirmPassword: "" }));
      await mutateSecurity();
      showToast(t("common.success"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const saveSmtpSettings = async () => {
    setIsSavingSmtp(true);
    try {
      await api("/api/settings/mail", {
        method: "PUT",
        body: JSON.stringify({ ...smtpForm, testRecipient })
      });
      await mutateSmtp();
      showToast(t("common.success"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testRecipient) {
      showToast("Please enter a recipient email address", "error");
      return;
    }
    setSendingTest(true);
    try {
      await api("/api/settings/mail/test", {
        method: "POST",
        body: JSON.stringify({ recipient: testRecipient })
      });
      showToast("Test email sent successfully", "success");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`Failed to send test email: ${errorMessage}`, "error");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Tabs */}
      <div className="submenu-container">
        <button
          onClick={() => setActiveTab("general")}
          className={`submenu-tab ${activeTab === "general" ? "active" : ""}`}
        >
          <SettingsIcon size={16} />
          {t("settings.general")}
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`submenu-tab ${activeTab === "security" ? "active" : ""}`}
        >
          <Shield size={16} />
          {t("settings.security")}
        </button>
        <button
          onClick={() => setActiveTab("mail")}
          className={`submenu-tab ${activeTab === "mail" ? "active" : ""}`}
        >
          <Mail size={16} />
          {t("settings.mail")}
        </button>
        <button
          onClick={() => setActiveTab("logging")}
          className={`submenu-tab ${activeTab === "logging" ? "active" : ""}`}
        >
          <FileText size={16} />
          Logging
        </button>
        <button
          onClick={() => setActiveTab("screenshots")}
          className={`submenu-tab ${activeTab === "screenshots" ? "active" : ""}`}
        >
          <FolderOpen size={16} />
          Screenshots
        </button>
        <button
          onClick={() => setActiveTab("vnc")}
          className={`submenu-tab ${activeTab === "vnc" ? "active" : ""}`}
        >
          <Monitor size={16} />
          VNC
        </button>
      </div>

      {/* General Settings */}
      {activeTab === "general" && (
        <div className="space-y-6">
          {/* Application Settings */}
          <div className="panel">
            <h3 className="panel-title flex items-center gap-2">
              <Monitor size={18} /> Application
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t("settings.language")}</label>
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-slate-500" />
                    <select
                      className="input-text"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="en">English</option>
                      {/* Add more languages here */}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-3">
                    <Shield size={18} className={adminData?.isAdministrator ? "text-green-400" : "text-amber-400"} />
                    <div>
                      <p className="text-sm font-medium text-white">{t("settings.runAsAdmin")}</p>
                      <p className="text-xs text-slate-400">
                        {adminData?.isAdministrator ? t("system.admin") : t("system.standard")}
                      </p>
                    </div>
                  </div>
                  {!adminData?.isAdministrator && (
                    <button className="btn-outline text-xs" onClick={restartAsAdmin}>
                      {t("system.restartAdmin")}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-3">
                    <Monitor size={18} className={startupData?.enabled ? "text-green-400" : "text-slate-500"} />
                    <div>
                      <p className="text-sm font-medium text-white">{t("settings.startWithWindows")}</p>
                      <p className="text-xs text-slate-400">
                        {startupData?.enabled ? "Enabled" : "Disabled"}
                      </p>
                    </div>
                  </div>
                  <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                    <input
                      type="checkbox"
                      name="toggle"
                      id="startup-toggle"
                      className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      checked={startupData?.enabled || false}
                      onChange={(e) => toggleStartup(e.target.checked)}
                      style={{ right: startupData?.enabled ? '0' : 'auto', left: startupData?.enabled ? 'auto' : '0', borderColor: startupData?.enabled ? '#3b82f6' : '#cbd5e1' }}
                    />
                    <label htmlFor="startup-toggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${startupData?.enabled ? 'bg-blue-500' : 'bg-slate-300'}`}></label>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Security Settings */}
      {activeTab === "security" && (
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="panel-title flex items-center gap-2 mb-0">
              <Lock size={18} /> {t("settings.authentication")}
            </h3>
            <button className="btn-primary" onClick={saveSecuritySettings} disabled={isSavingSecurity}>
              <Save size={16} /> {isSavingSecurity ? t("common.loading") : t("common.save")}
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requireAuth"
                className="checkbox"
                checked={securityForm.requireAuthentication}
                onChange={(e) => setSecurityForm({ ...securityForm, requireAuthentication: e.target.checked })}
              />
              <label htmlFor="requireAuth" className="text-sm text-slate-300">
                {t("settings.requireAuth")}
              </label>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <p className="text-sm font-medium text-slate-300">{t("settings.changePassword")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">New Password</label>
                  <input
                    type="password"
                    className="input-text"
                    value={securityForm.password}
                    onChange={(e) => setSecurityForm({ ...securityForm, password: e.target.value })}
                    placeholder="Leave empty to keep current"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    className="input-text"
                    value={securityForm.confirmPassword}
                    onChange={(e) => setSecurityForm({ ...securityForm, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mail Settings */}
      {activeTab === "mail" && (
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="panel-title flex items-center gap-2 mb-0">
              <Mail size={18} /> {t("settings.smtpSettings")}
            </h3>
            <button className="btn-primary" onClick={saveSmtpSettings} disabled={isSavingSmtp}>
              <Save size={16} /> {isSavingSmtp ? t("common.loading") : t("common.save")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.host")}</label>
              <input
                className="input-text"
                value={smtpForm.host}
                onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.port")}</label>
              <input
                type="number"
                className="input-text"
                value={smtpForm.port}
                onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.username")}</label>
              <input
                className="input-text"
                value={smtpForm.username || ""}
                onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.password")}</label>
              <input
                type="password"
                className="input-text"
                value={smtpForm.password || ""}
                onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.senderEmail")}</label>
              <input
                className="input-text"
                value={smtpForm.fromAddress || ""}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromAddress: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.senderName")}</label>
              <input
                className="input-text"
                value={smtpForm.fromName || ""}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="enableSsl"
                className="checkbox"
                checked={smtpForm.enableSsl}
                onChange={(e) => setSmtpForm({ ...smtpForm, enableSsl: e.target.checked })}
              />
              <label htmlFor="enableSsl" className="text-sm text-slate-300">
                {t("settings.useSsl")}
              </label>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <h4 className="text-sm font-medium text-white mb-3">{t("settings.sendTestEmail")}</h4>
            <div className="flex gap-2">
              <input
                className="input-text flex-1"
                placeholder={t("settings.recipient")}
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
              <button className="btn-outline" onClick={sendTestEmail} disabled={sendingTest}>
                <Send size={16} /> {sendingTest ? t("common.loading") : t("settings.sendTestEmail")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logging Settings */}
      {activeTab === "logging" && <LoggingSettingsTab />}

      {/* Screenshots Settings */}
      {activeTab === "screenshots" && (
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="panel-title flex items-center gap-2 mb-0">
              <FolderOpen size={18} /> Screenshots
            </h3>
            <button className="btn-primary" onClick={saveGeneralSettings} disabled={isSavingGeneral}>
              <Save size={16} /> {isSavingGeneral ? t("common.loading") : t("common.save")}
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.destinationFolder")}</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm text-white"
                  value={formatPath(captureForm.folder)}
                  onChange={(e) => {
                    // Normalize path by removing double backslashes
                    const normalized = e.target.value.replace(/\\\\/g, '\\');
                    setCaptureForm({ ...captureForm, folder: normalized });
                  }}
                />
                <button className="btn-outline" type="button" onClick={() => setShowPicker(true)}>
                  <FolderOpen size={16} />
                </button>
              </div>
            </div>

            {showPicker && (
              <FolderPicker
                initialPath={captureForm.folder}
                onSelect={(path) => {
                  // Normalize path by removing double backslashes
                  const normalized = path.replace(/\\\\/g, '\\');
                  setCaptureForm({ ...captureForm, folder: normalized });
                  setShowPicker(false);
                }}
                onCancel={() => setShowPicker(false)}
              />
            )}

            <div className="space-y-2">
              <label className="text-sm text-slate-300">{t("settings.filenamePattern")}</label>
              <input
                className="input-text"
                value={captureForm.filenamePattern}
                onChange={(e) => setCaptureForm({ ...captureForm, filenamePattern: e.target.value })}
                placeholder="screenshot_{timestamp}.png"
              />
              <p className="text-xs text-slate-500">
                Example: {formatPath(captureForm.folder)}\{(captureForm.filenamePattern || "screenshot_{timestamp}.png").replace("{timestamp}", new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VNC Settings */}
      {activeTab === "vnc" && <RemoteDesktopSettingsTab />}
    </section>
  );
}

function LoggingSettingsTab() {
  const loggingFetcher = () => api<LoggingConfig>("/api/settings/logging");
  const { data: loggingData, mutate: mutateLogging } = useSWR("logging-settings", loggingFetcher);
  const [loggingForm, setLoggingForm] = useState<LoggingConfig>({
    folder: "",
    retentionDays: 14,
    minimumLevel: "Information",
    maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
    maxFilesPerDay: 5,
    enableSizeRotation: true,
    componentEnabled: {
      VNC: true,
      DiskMonitor: true,
      ApplicationMonitor: true,
      Screenshots: true,
      General: true
    }
  });
  const [showLoggingPicker, setShowLoggingPicker] = useState(false);
  const [isSavingLogging, setIsSavingLogging] = useState(false);

  useEffect(() => {
    if (loggingData) {
      setLoggingForm({
        ...loggingData,
        componentEnabled: loggingData.componentEnabled || {
          VNC: true,
          DiskMonitor: true,
          ApplicationMonitor: true,
          Screenshots: true,
          General: true
        }
      });
    }
  }, [loggingData]);

  const saveLoggingSettings = async () => {
    setIsSavingLogging(true);
    try {
      await api("/api/settings/logging", {
        method: "PUT",
        body: JSON.stringify(loggingForm)
      });
      await mutateLogging();
      showToast("Logging settings saved!", "success");
    } catch (err) {
      console.error("Failed to save logging settings:", err);
      showToast(`Failed to save logging settings: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setIsSavingLogging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="panel">
        <h3 className="panel-title flex items-center gap-2">
          <FileText size={18} /> Log File Rotation
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Log Folder</label>
            <div className="flex gap-2">
              <input
                className="input-text flex-1"
                value={formatPath(loggingForm.folder)}
                onChange={(e) => {
                  // Normalize path by removing double backslashes
                  const normalized = e.target.value.replace(/\\\\/g, '\\');
                  setLoggingForm({ ...loggingForm, folder: normalized });
                }}
              />
              <button className="btn-outline" type="button" onClick={() => setShowLoggingPicker(true)}>
                <FolderOpen size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Retention Days</label>
              <input
                type="number"
                className="input-text"
                min="0"
                value={loggingForm.retentionDays}
                onChange={(e) => setLoggingForm({ ...loggingForm, retentionDays: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-slate-500 mt-1">How many days to keep log files (0 = keep forever)</p>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Minimum Log Level</label>
              <select
                className="input-text"
                value={loggingForm.minimumLevel}
                onChange={(e) => setLoggingForm({ ...loggingForm, minimumLevel: e.target.value })}
              >
                <option value="Trace">Trace</option>
                <option value="Debug">Debug</option>
                <option value="Information">Information</option>
                <option value="Warning">Warning</option>
                <option value="Error">Error</option>
                <option value="Critical">Critical</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="enableSizeRotation"
                className="checkbox"
                checked={loggingForm.enableSizeRotation}
                onChange={(e) => setLoggingForm({ ...loggingForm, enableSizeRotation: e.target.checked })}
              />
              <label htmlFor="enableSizeRotation" className="text-sm text-slate-300">
                Enable size-based rotation
              </label>
            </div>

            {loggingForm.enableSizeRotation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-slate-800">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max File Size (MB)</label>
                  <input
                    type="number"
                    className="input-text"
                    min="1"
                    step="1"
                    value={Math.round(loggingForm.maxFileSizeBytes / (1024 * 1024))}
                    onChange={(e) => {
                      const mb = parseInt(e.target.value) || 1;
                      setLoggingForm({ ...loggingForm, maxFileSizeBytes: mb * 1024 * 1024 });
                    }}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Current: {formatBytes(loggingForm.maxFileSizeBytes)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max Files Per Day</label>
                  <input
                    type="number"
                    className="input-text"
                    min="0"
                    value={loggingForm.maxFilesPerDay}
                    onChange={(e) => setLoggingForm({ ...loggingForm, maxFilesPerDay: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-slate-500 mt-1">Maximum rotated files to keep per day (0 = unlimited)</p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button className="btn-primary" onClick={saveLoggingSettings} disabled={isSavingLogging}>
              <Save size={16} /> {isSavingLogging ? "Saving…" : "Save Logging Settings"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title flex items-center gap-2">
          <Monitor size={18} /> Component Logging
        </h3>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Enable or disable logging for specific components. Each component writes to its own log file in a subfolder.
          </p>
          
          <div className="space-y-3">
            {["VNC", "DiskMonitor", "ApplicationMonitor", "Screenshots", "General"].map((component) => (
              <div key={component} className="flex items-center justify-between p-3 bg-slate-900/50 rounded border border-slate-800">
                <div>
                  <label className="text-sm font-medium text-slate-300 cursor-pointer" htmlFor={`component-${component}`}>
                    {component}
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    {component === "VNC" && "VNC server and connection logs"}
                    {component === "DiskMonitor" && "Disk and folder monitoring logs"}
                    {component === "ApplicationMonitor" && "Application monitoring and restart logs"}
                    {component === "Screenshots" && "Screenshot capture and interval logs"}
                    {component === "General" && "General application logs"}
                  </p>
                </div>
                <input
                  type="checkbox"
                  id={`component-${component}`}
                  className="checkbox"
                  checked={loggingForm.componentEnabled?.[component] ?? true}
                  onChange={(e) => {
                    setLoggingForm({
                      ...loggingForm,
                      componentEnabled: {
                        ...loggingForm.componentEnabled,
                        [component]: e.target.checked
                      }
                    });
                  }}
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button className="btn-primary" onClick={saveLoggingSettings} disabled={isSavingLogging}>
              <Save size={16} /> {isSavingLogging ? "Saving…" : "Save Component Settings"}
            </button>
          </div>
        </div>
      </div>

      {showLoggingPicker && (
        <FolderPicker
          initialPath={loggingForm.folder}
          onSelect={(path) => {
            // Normalize path by removing double backslashes
            const normalized = path.replace(/\\\\/g, '\\');
            setLoggingForm({ ...loggingForm, folder: normalized });
            setShowLoggingPicker(false);
          }}
          onCancel={() => setShowLoggingPicker(false)}
        />
      )}
    </div>
  );
}

function RemoteDesktopSettingsTab() {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  const { data: config, mutate: mutateConfig } = useSWR<VncConfig>("vnc-config", () => api<VncConfig>("/api/vnc/config"));

  const [vncForm, setVncForm] = useState<VncConfig>({
    enabled: false,
    port: 5900,
    allowRemote: false,
    hasPassword: false,
    autoStart: false
  });

  useEffect(() => {
    if (config) {
      setVncForm(config);
    }
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api("/api/vnc/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: vncForm.enabled,
          port: vncForm.port,
          allowRemote: vncForm.allowRemote,
          autoStart: vncForm.autoStart,
          password: password || undefined
        })
      });
      await mutateConfig();
      setPassword("");
      showToast(t("settings.remoteDesktop.saveSuccess"), "success");
    } catch (err) {
      showToast(t("settings.remoteDesktop.saveFailure", { message: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="panel-title mb-0 flex items-center gap-2">
            <Monitor size={18} /> {t("settings.remoteDesktop.title")}
          </h3>
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
            <Save size={16} /> {isSaving ? t("settings.remoteDesktop.saving") : t("common.save")}
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="vnc-enable"
                className="checkbox"
                checked={vncForm.enabled}
                onChange={(e) => setVncForm({ ...vncForm, enabled: e.target.checked })}
              />
              <label htmlFor="vnc-enable" className="text-sm text-slate-300 cursor-pointer">
                {t("settings.remoteDesktop.enable")}
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="vnc-port" className="block text-sm text-slate-400 mb-1">{t("settings.remoteDesktop.port")}</label>
            <input
              type="number"
              id="vnc-port"
              min={1024}
              max={65535}
              className="input-text w-32"
              value={vncForm.port}
              onChange={(e) => setVncForm({ ...vncForm, port: parseInt(e.target.value) || 5900 })}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="vnc-auto-start"
              className="checkbox"
              checked={vncForm.autoStart ?? false}
              onChange={(e) => setVncForm({ ...vncForm, autoStart: e.target.checked })}
            />
            <label htmlFor="vnc-auto-start" className="text-sm text-slate-300 cursor-pointer">
              Auto-start VNC server when Weasel starts
            </label>
          </div>

          <div>
            <label htmlFor="vnc-password" className="block text-sm text-slate-400 mb-1">{t("settings.remoteDesktop.password")}</label>
            <div className="flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                id="vnc-password"
                className="input-text flex-1"
                placeholder={vncForm.hasPassword ? t("settings.remoteDesktop.passwordPlaceholder") : t("settings.remoteDesktop.passwordEmpty")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="btn-outline"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? t("settings.remoteDesktop.hidePassword") : t("settings.remoteDesktop.showPassword")}
              >
                <Eye size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">{t("settings.remoteDesktop.passwordHint")}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="vnc-allow-remote"
                className="checkbox"
                checked={vncForm.allowRemote}
                onChange={(e) => setVncForm({ ...vncForm, allowRemote: e.target.checked })}
              />
              <label htmlFor="vnc-allow-remote" className="text-sm text-slate-300 cursor-pointer">
                {t("settings.remoteDesktop.allowRemote")}
              </label>
            </div>
          </div>

          {vncForm.allowRemote && (
            <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Shield size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-200">
                  <p className="font-semibold mb-1">{t("settings.remoteDesktop.securityWarning")}</p>
                  <p>{t("settings.remoteDesktop.securityWarningText")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
