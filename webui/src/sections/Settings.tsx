import { useState, useEffect } from "react";
import useSWR from "swr";
import { FolderOpen, Lock, Save, Mail, Send, Settings as SettingsIcon, Monitor, Shield, Globe, FileText, Eye, Video, Palette } from "lucide-react";
import { api, getUiPreferences, saveUiPreferences, getFileExplorerSettings, saveFileExplorerSettings } from "../api/client";
import { CaptureSettings, SmtpConfig, LoggingConfig, VncConfig, FileExplorerConfig, VncRecordingOptions } from "../types";
import FolderPicker from "../components/FolderPicker";
import ToggleBar from "../components/ToggleBar";
import { useDebouncedSave } from "../hooks/useDebouncedSave";
import { useTranslation } from "../i18n/i18n";
import { useTheme } from "../theme/useTheme";
import { formatPath, formatBytes } from "../utils/format";
import { showToast } from "../App";
import ConfirmDialog from "../components/ConfirmDialog";

const captureFetcher = () => api<CaptureSettings>("/api/settings/capture");
const securityFetcher = () => api<{ requireAuthentication: boolean; hasPassword: boolean }>("/api/settings/security");
const smtpFetcher = () => api<SmtpConfig>("/api/settings/mail");
const startupFetcher = () => api<{ enabled: boolean }>("/api/system/startup");
const adminStatusFetcher = () => api<{ isAdministrator: boolean }>("/api/system/admin/status");

type SettingsTab = "general" | "security" | "mail" | "logging" | "screenshots" | "files" | "vnc";

export default function Settings() {
  const { t, language, setLanguage } = useTranslation();
  const { themeName, setTheme, availableThemes } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Hash routing support for subtabs
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (!hash) return;

      // Parse hash format: /settings/subtab
      const parts = hash.split('/').filter(Boolean);
      if (parts[0] === 'settings' && parts[1]) {
        const subtab = parts[1] as SettingsTab;
        // Validate subtab exists
        const validSubtabs: SettingsTab[] = ["general", "security", "mail", "logging", "screenshots", "files", "vnc"];
        if (validSubtabs.includes(subtab)) {
          setActiveTab(subtab);
        }
      }
    };

    // Handle initial hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update hash when subtab changes
  useEffect(() => {
    const currentHash = window.location.hash.slice(1);
    const parts = currentHash.split('/').filter(Boolean);

    // Only update if we're on the settings tab and the subtab is different
    if (parts[0] === 'settings' && parts[1] !== activeTab) {
      window.location.hash = `/settings/${activeTab}`;
    }
  }, [activeTab]);

  // General Settings State
  const { data: startupData, mutate: mutateStartup } = useSWR("startup-status", startupFetcher);
  const { data: adminData, mutate: mutateAdmin } = useSWR("admin-status", adminStatusFetcher);
  const { data: uiPreferences, mutate: mutateUiPreferences } = useSWR("ui-preferences", getUiPreferences);

  // Security Settings State
  const { data: securityData, mutate: mutateSecurity } = useSWR("security-settings", securityFetcher);
  const [securityForm, setSecurityForm] = useState({
    requireAuthentication: false,
    password: "",
    confirmPassword: ""
  });
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
    variant: "info"
  });

  // Initialize forms
  useEffect(() => {
    if (securityData) {
      setSecurityForm((prev: any) => ({
        ...prev,
        requireAuthentication: securityData.requireAuthentication
      }));
    }
  }, [securityData]);

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

  return (
    <section className="space-y-4">
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
          onClick={() => setActiveTab("files")}
          className={`submenu-tab ${activeTab === "files" ? "active" : ""}`}
        >
          <FolderOpen size={16} />
          Files
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
                      <option value="de">Deutsch</option>
                      <option value="fr">Français</option>
                      <option value="nl">Nederlands</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t("settings.theme")}</label>
                  <div className="flex items-center gap-2">
                    <Palette size={16} className="text-slate-500" />
                    <select
                      className="input-text"
                      value={themeName}
                      onChange={(e) => setTheme(e.target.value as 'weasel' | 'dark' | 'light')}
                    >
                      <option value="weasel">Weasel</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
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

                <ToggleBar
                  label={t("settings.startWithWindows")}
                  description="Launch Weasel automatically at Windows startup"
                  enabled={startupData?.enabled || false}
                  onChange={toggleStartup}
                  icon={<Monitor size={18} />}
                  iconColorEnabled="text-green-400"
                  iconColorDisabled="text-slate-500"
                />
              </div>
            </div>
          </div>

          {/* UI Preferences */}
          <div className="panel">
            <h3 className="panel-title flex items-center gap-2">
              <Eye size={18} /> User Interface Preferences
            </h3>
            <div className="space-y-4">
              <ToggleBar
                label="Expand log panels by default"
                description="New log panels will open expanded"
                enabled={uiPreferences?.logPanelExpanded?.['default'] ?? false}
                onChange={async (enabled) => {
                  try {
                    const updated = {
                      ...uiPreferences!,
                      logPanelExpanded: {
                        ...uiPreferences?.logPanelExpanded,
                        'default': enabled
                      }
                    };
                    await saveUiPreferences(updated);
                    mutateUiPreferences();
                    showToast("Preference saved successfully", "success");
                  } catch (error) {
                    showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                  }
                }}
                icon={<Eye size={18} />}
              />

              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-sm font-semibold text-white mb-3">Pagination Defaults</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Default items per page (text data)</label>
                    <select
                      className="input-text"
                      value={uiPreferences?.defaultTextPageSize ?? 50}
                      onChange={async (e) => {
                        try {
                          const updated = {
                            ...uiPreferences!,
                            defaultTextPageSize: parseInt(e.target.value)
                          };
                          await saveUiPreferences(updated);
                          mutateUiPreferences();
                          showToast("Preference saved successfully", "success");
                        } catch (error) {
                          showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                        }
                      }}
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Default page size for lists, tables, and text-based data
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Default items per page (images)</label>
                    <select
                      className="input-text"
                      value={uiPreferences?.defaultImagePageSize ?? 25}
                      onChange={async (e) => {
                        try {
                          const updated = {
                            ...uiPreferences!,
                            defaultImagePageSize: parseInt(e.target.value)
                          };
                          await saveUiPreferences(updated);
                          mutateUiPreferences();
                          showToast("Preference saved successfully", "success");
                        } catch (error) {
                          showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                        }
                      }}
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Default page size for image grids and thumbnails
                    </p>
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
          <h3 className="panel-title flex items-center gap-2">
            <Lock size={18} /> {t("settings.authentication")}
          </h3>

          <div className="space-y-4">
            <ToggleBar
              label={t("settings.requireAuth")}
              description="Protect web console access"
              enabled={securityForm.requireAuthentication}
              onChange={async (enabled) => {
                try {
                  await api("/api/settings/security", {
                    method: "PUT",
                    body: JSON.stringify({
                      requireAuthentication: enabled,
                      password: null
                    })
                  });
                  setSecurityForm({ ...securityForm, requireAuthentication: enabled });
                  await mutateSecurity();
                  showToast(t("common.success"), "success");
                } catch (error) {
                  showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
                }
              }}
              icon={<Shield size={18} />}
            />

            <div className="space-y-3 pt-2 border-t border-slate-800">
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
              <button
                className="btn-primary"
                onClick={saveSecuritySettings}
                disabled={isSavingSecurity || !securityForm.password || securityForm.password !== securityForm.confirmPassword}
              >
                <Save size={16} /> {isSavingSecurity ? t("common.loading") : t("settings.changePassword")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Settings */}
      {activeTab === "mail" && <MailSettingsTab />}

      {/* Logging Settings */}
      {activeTab === "logging" && <LoggingSettingsTab />}

      {/* Screenshots Settings */}
      {activeTab === "screenshots" && <ScreenshotsSettingsTab />}

      {/* Files Settings */}
      {activeTab === "files" && <FilesSettingsTab />}

      {/* VNC Settings */}
      {activeTab === "vnc" && <RemoteDesktopSettingsTab />}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        variant={confirmDialog.variant}
      />
    </section>
  );
}

function MailSettingsTab() {
  const { t } = useTranslation();
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
  const [sendingTest, setSendingTest] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");

  useEffect(() => {
    if (smtpData) {
      setSmtpForm(smtpData);
      if (smtpData.testRecipient) setTestRecipient(smtpData.testRecipient);
    }
  }, [smtpData]);

  // Debounced save for text inputs
  const debouncedSaveSmtp = useDebouncedSave(
    async (data: SmtpConfig) => {
      await api("/api/settings/mail", {
        method: "PUT",
        body: JSON.stringify({ ...data, testRecipient })
      });
    },
    mutateSmtp,
    500
  );

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
    <div className="panel">
      <h3 className="panel-title flex items-center gap-2">
        <Mail size={18} /> {t("settings.smtpSettings")}
      </h3>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t("settings.host")}</label>
            <input
              className="input-text"
              value={smtpForm.host}
              onChange={(e) => {
                const updated = { ...smtpForm, host: e.target.value };
                setSmtpForm(updated);
                debouncedSaveSmtp(updated, false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t("settings.port")}</label>
            <input
              type="number"
              className="input-text"
              value={smtpForm.port}
              onChange={(e) => {
                const updated = { ...smtpForm, port: Number(e.target.value) };
                setSmtpForm(updated);
                debouncedSaveSmtp(updated, false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t("settings.username")}</label>
            <input
              className="input-text"
              value={smtpForm.username || ""}
              onChange={(e) => {
                const updated = { ...smtpForm, username: e.target.value };
                setSmtpForm(updated);
                debouncedSaveSmtp(updated, false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t("settings.password")}</label>
            <input
              type="password"
              className="input-text"
              value={smtpForm.password || ""}
              onChange={(e) => {
                const updated = { ...smtpForm, password: e.target.value };
                setSmtpForm(updated);
                debouncedSaveSmtp(updated, false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t("settings.senderEmail")}</label>
            <input
              className="input-text"
              value={smtpForm.fromAddress || ""}
              onChange={(e) => {
                const updated = { ...smtpForm, fromAddress: e.target.value };
                setSmtpForm(updated);
                debouncedSaveSmtp(updated, false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t("settings.senderName")}</label>
            <input
              className="input-text"
              value={smtpForm.fromName || ""}
              onChange={(e) => {
                const updated = { ...smtpForm, fromName: e.target.value };
                setSmtpForm(updated);
                debouncedSaveSmtp(updated, false);
              }}
            />
          </div>
        </div>

        <div className="pt-2">
          <ToggleBar
            label={t("settings.useSsl")}
            description="Use SSL/TLS encryption"
            enabled={smtpForm.enableSsl}
            onChange={async (enabled) => {
              try {
                const updated = { ...smtpForm, enableSsl: enabled };
                setSmtpForm(updated);
                await api("/api/settings/mail", {
                  method: "PUT",
                  body: JSON.stringify({ ...updated, testRecipient })
                });
                await mutateSmtp();
                showToast(t("common.success"), "success");
              } catch (error) {
                showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            icon={<Lock size={18} />}
          />
        </div>

        <div className="pt-4 border-t border-slate-800">
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
    </div>
  );
}

function ScreenshotsSettingsTab() {
  const { t } = useTranslation();
  const { data: captureData, mutate: mutateCapture } = useSWR("capture-settings", captureFetcher);
  const { data: uiPreferences, mutate: mutateUiPreferences } = useSWR("ui-preferences", getUiPreferences);

  const [captureForm, setCaptureForm] = useState<CaptureSettings>({
    folder: "",
    timedFolder: "",
    filenamePattern: "",
    enableIntervalCapture: false,
    intervalSeconds: 60
  });
  const [showPicker, setShowPicker] = useState(false);
  const [showTimedPicker, setShowTimedPicker] = useState(false);

  useEffect(() => {
    if (captureData) {
      setCaptureForm({
        folder: captureData.folder || "",
        timedFolder: captureData.timedFolder || "",
        filenamePattern: captureData.filenamePattern || "",
        enableIntervalCapture: false,
        intervalSeconds: 60
      });
    }
  }, [captureData]);

  // Debounced save for text inputs
  const debouncedSaveCapture = useDebouncedSave(
    async (data: CaptureSettings) => {
      await api("/api/settings/capture", {
        method: "PUT",
        body: JSON.stringify({
          folder: data.folder,
          timedFolder: data.timedFolder,
          filenamePattern: data.filenamePattern,
          enableIntervalCapture: captureData?.enableIntervalCapture || false,
          intervalSeconds: captureData?.intervalSeconds || 60
        })
      });
    },
    mutateCapture,
    500
  );

  return (
    <div className="panel">
      <h3 className="panel-title flex items-center gap-2">
        <FolderOpen size={18} /> Screenshots
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Screenshot Folder</label>
          <div className="flex gap-2">
            <input
              className="input-text flex-1"
              value={formatPath(captureForm.folder)}
              onChange={(e) => {
                const normalized = e.target.value.replace(/\\\\/g, '\\');
                const updated = { ...captureForm, folder: normalized };
                setCaptureForm(updated);
                debouncedSaveCapture(updated, false);
              }}
            />
            <button className="btn-outline" type="button" onClick={() => setShowPicker(true)}>
              <FolderOpen size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Default location for manual screenshots
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Timed Screenshot Folder</label>
          <div className="flex gap-2">
            <input
              className="input-text flex-1"
              value={formatPath(captureForm.timedFolder || "")}
              onChange={(e) => {
                const normalized = e.target.value.replace(/\\\\/g, '\\');
                const updated = { ...captureForm, timedFolder: normalized };
                setCaptureForm(updated);
                debouncedSaveCapture(updated, false);
              }}
            />
            <button className="btn-outline" type="button" onClick={() => setShowTimedPicker(true)}>
              <FolderOpen size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Location for automatic interval screenshots
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Filename Pattern</label>
          <input
            className="input-text"
            value={captureForm.filenamePattern}
            onChange={(e) => {
              const updated = { ...captureForm, filenamePattern: e.target.value };
              setCaptureForm(updated);
              debouncedSaveCapture(updated, false);
            }}
            placeholder="screenshot_{timestamp}.png"
          />
          <p className="text-xs text-slate-500 mt-1">
            Use {'{timestamp}'} for date/time, {'{display}'} for display number
          </p>
        </div>

        <div className="pt-2 border-t border-slate-800">
          <ToggleBar
            label="Expand log panel by default"
            description="Screenshot capture logs"
            enabled={uiPreferences?.logPanelExpanded?.['Screenshots'] ?? false}
            onChange={async (enabled) => {
              try {
                const updated = {
                  ...uiPreferences!,
                  logPanelExpanded: {
                    ...uiPreferences?.logPanelExpanded,
                    'Screenshots': enabled
                  }
                };
                await saveUiPreferences(updated);
                await mutateUiPreferences();
                showToast("Preference saved successfully", "success");
              } catch (error) {
                showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            icon={<Eye size={18} />}
          />
        </div>

        {showPicker && (
          <FolderPicker
            initialPath={captureForm.folder}
            onSelect={async (path) => {
              const normalized = path.replace(/\\\\/g, '\\');
              const updated = { ...captureForm, folder: normalized };
              setCaptureForm(updated);
              setShowPicker(false);
              // Immediate save for folder picker
              try {
                await api("/api/settings/capture", {
                  method: "PUT",
                  body: JSON.stringify({
                    folder: normalized,
                    timedFolder: captureForm.timedFolder,
                    filenamePattern: captureForm.filenamePattern,
                    enableIntervalCapture: captureData?.enableIntervalCapture || false,
                    intervalSeconds: captureData?.intervalSeconds || 60
                  })
                });
                await mutateCapture();
                showToast("Folder saved successfully", "success");
              } catch (error) {
                showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            onCancel={() => setShowPicker(false)}
          />
        )}

        {showTimedPicker && (
          <FolderPicker
            initialPath={captureForm.timedFolder || ""}
            onSelect={async (path) => {
              const normalized = path.replace(/\\\\/g, '\\');
              const updated = { ...captureForm, timedFolder: normalized };
              setCaptureForm(updated);
              setShowTimedPicker(false);
              // Immediate save for folder picker
              try {
                await api("/api/settings/capture", {
                  method: "PUT",
                  body: JSON.stringify({
                    folder: captureForm.folder,
                    timedFolder: normalized,
                    filenamePattern: captureForm.filenamePattern,
                    enableIntervalCapture: captureData?.enableIntervalCapture || false,
                    intervalSeconds: captureData?.intervalSeconds || 60
                  })
                });
                await mutateCapture();
                showToast("Folder saved successfully", "success");
              } catch (error) {
                showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            onCancel={() => setShowTimedPicker(false)}
          />
        )}
      </div>
    </div>
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
    },
    componentLevels: {}
  });
  const [showLoggingPicker, setShowLoggingPicker] = useState(false);

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
        },
        componentLevels: loggingData.componentLevels || {}
      });
    }
  }, [loggingData]);

  // Debounced save for text/number inputs
  const debouncedSaveLogging = useDebouncedSave(
    async (data: LoggingConfig) => {
      await api("/api/settings/logging", {
        method: "PUT",
        body: JSON.stringify(data)
      });
    },
    mutateLogging,
    500
  );

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
                  const normalized = e.target.value.replace(/\\\\/g, '\\');
                  const updated = { ...loggingForm, folder: normalized };
                  setLoggingForm(updated);
                  debouncedSaveLogging(updated, false);
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
                onChange={(e) => {
                  const updated = { ...loggingForm, retentionDays: parseInt(e.target.value) || 0 };
                  setLoggingForm(updated);
                  debouncedSaveLogging(updated, false);
                }}
              />
              <p className="text-xs text-slate-500 mt-1">How many days to keep log files (0 = keep forever)</p>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Minimum Log Level</label>
              <select
                className="input-text"
                value={loggingForm.minimumLevel}
                onChange={async (e) => {
                  const updated = { ...loggingForm, minimumLevel: e.target.value };
                  setLoggingForm(updated);
                  // Immediate save for select
                  try {
                    await api("/api/settings/logging", {
                      method: "PUT",
                      body: JSON.stringify(updated)
                    });
                    await mutateLogging();
                    showToast("Log level saved successfully", "success");
                  } catch (error) {
                    showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                  }
                }}
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
            <ToggleBar
              label="Enable size-based rotation"
              description="Rotate log files when they reach a certain size"
              enabled={loggingForm.enableSizeRotation}
              onChange={async (enabled) => {
                try {
                  const updated = { ...loggingForm, enableSizeRotation: enabled };
                  setLoggingForm(updated);
                  await api("/api/settings/logging", {
                    method: "PUT",
                    body: JSON.stringify(updated)
                  });
                  await mutateLogging();
                  showToast("Settings saved successfully", "success");
                } catch (error) {
                  showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                }
              }}
            />

            {loggingForm.enableSizeRotation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pl-6 border-l-2 border-slate-800">
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
                      const updated = { ...loggingForm, maxFileSizeBytes: mb * 1024 * 1024 };
                      setLoggingForm(updated);
                      debouncedSaveLogging(updated, false);
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
                    onChange={(e) => {
                      const updated = { ...loggingForm, maxFilesPerDay: parseInt(e.target.value) || 0 };
                      setLoggingForm(updated);
                      debouncedSaveLogging(updated, false);
                    }}
                  />
                  <p className="text-xs text-slate-500 mt-1">Maximum rotated files to keep per day (0 = unlimited)</p>
                </div>
              </div>
            )}
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
            {["VNC", "DiskMonitor", "ApplicationMonitor", "Screenshots", "Files", "General"].map((component) => (
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
                    {component === "Files" && "File Explorer operations and navigation logs"}
                    {component === "General" && "General application logs"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <select
                    className="input-text text-xs py-1 w-24"
                    value={loggingForm.componentLevels?.[component] || loggingForm.minimumLevel}
                    onChange={async (e) => {
                      const updated = {
                        ...loggingForm,
                        componentLevels: {
                          ...loggingForm.componentLevels,
                          [component]: e.target.value
                        }
                      };
                      setLoggingForm(updated);
                      // Immediate save for select
                      try {
                        await api("/api/settings/logging", {
                          method: "PUT",
                          body: JSON.stringify(updated)
                        });
                        await mutateLogging();
                      } catch (error) {
                        console.error("Failed to save component level:", error);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="Trace">Trace</option>
                    <option value="Debug">Debug</option>
                    <option value="Information">Info</option>
                    <option value="Warning">Warn</option>
                    <option value="Error">Error</option>
                    <option value="Critical">Critical</option>
                    <option value="None">None</option>
                  </select>
                  <input
                    type="checkbox"
                    id={`component-${component}`}
                    className="checkbox"
                    checked={loggingForm.componentEnabled?.[component] ?? true}
                    onChange={async (e) => {
                      const updated = {
                        ...loggingForm,
                        componentEnabled: {
                          ...loggingForm.componentEnabled,
                          [component]: e.target.checked
                        }
                      };
                      setLoggingForm(updated);
                      // Immediate save for checkbox
                      try {
                        await api("/api/settings/logging", {
                          method: "PUT",
                          body: JSON.stringify(updated)
                        });
                        await mutateLogging();
                      } catch (error) {
                        console.error("Failed to save component enabled state:", error);
                      }
                    }}
                  />
                </div>
              </div>
            ))}
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

function FilesSettingsTab() {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);

  const { data: fileExplorerConfig, mutate: mutateFileExplorer } = useSWR(
    "file-explorer-settings",
    getFileExplorerSettings
  );

  const { data: uiPreferences, mutate: mutateUiPreferences } = useSWR(
    "ui-preferences",
    getUiPreferences
  );

  const [fileExplorerForm, setFileExplorerForm] = useState<FileExplorerConfig>({
    homeFolder: ""
  });

  useEffect(() => {
    if (fileExplorerConfig) {
      setFileExplorerForm(fileExplorerConfig);
    }
  }, [fileExplorerConfig]);

  // Debounced save for home folder text input
  const debouncedSaveFileExplorer = useDebouncedSave(
    async (data: FileExplorerConfig) => {
      await saveFileExplorerSettings(data);
    },
    mutateFileExplorer,
    500
  );

  return (
    <div className="space-y-6">
      {/* Home Folder Configuration */}
      <div className="panel">
        <h3 className="panel-title flex items-center gap-2">
          <FolderOpen size={18} /> File Explorer Configuration
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Home Folder</label>
            <div className="flex gap-2">
              <input
                className="input-text flex-1"
                value={formatPath(fileExplorerForm.homeFolder)}
                onChange={(e) => {
                  const normalized = e.target.value.replace(/\\\\/g, '\\');
                  const updated = { ...fileExplorerForm, homeFolder: normalized };
                  setFileExplorerForm(updated);
                  debouncedSaveFileExplorer(updated, false);
                }}
              />
              <button className="btn-outline" type="button" onClick={() => setShowPicker(true)}>
                <FolderOpen size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Default starting location for File Explorer
            </p>
          </div>

          {showPicker && (
            <FolderPicker
              initialPath={fileExplorerForm.homeFolder}
              onSelect={async (path) => {
                const normalized = path.replace(/\\\\/g, '\\');
                const updated = { ...fileExplorerForm, homeFolder: normalized };
                setFileExplorerForm(updated);
                setShowPicker(false);
                // Immediate save for folder picker
                try {
                  await saveFileExplorerSettings(updated);
                  await mutateFileExplorer();
                  showToast("Home folder saved successfully", "success");
                } catch (error) {
                  showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                }
              }}
              onCancel={() => setShowPicker(false)}
            />
          )}
        </div>
      </div>

      {/* UI Preferences */}
      <div className="panel">
        <h3 className="panel-title flex items-center gap-2">
          <Eye size={18} /> Display Preferences
        </h3>

        <div className="space-y-4">
          <ToggleBar
            label="Expand log panel by default"
            description="File Explorer operation logs"
            enabled={uiPreferences?.logPanelExpanded?.['Files'] ?? false}
            onChange={async (enabled) => {
              try {
                const updated = {
                  ...uiPreferences!,
                  logPanelExpanded: {
                    ...uiPreferences?.logPanelExpanded,
                    'Files': enabled
                  }
                };
                await saveUiPreferences(updated);
                await mutateUiPreferences();
                showToast("Preference saved successfully", "success");
              } catch (error) {
                showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            icon={<Eye size={18} />}
          />
        </div>
      </div>
    </div>
  );
}


function RemoteDesktopSettingsTab() {
  const { t } = useTranslation();
  const [isSavingPassword, setIsSavingPassword] = useState(false);
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

  // Debounced save for port input
  const debouncedSaveVnc = useDebouncedSave(
    async (data: VncConfig) => {
      await api("/api/vnc/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          port: data.port,
          allowRemote: data.allowRemote,
          autoStart: data.autoStart,
          password: undefined
        })
      });
    },
    mutateConfig,
    500
  );

  const handleSetPassword = async () => {
    if (!password) {
      showToast("Please enter a password", "error");
      return;
    }
    setIsSavingPassword(true);
    try {
      await api("/api/vnc/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          port: vncForm.port,
          allowRemote: vncForm.allowRemote,
          autoStart: vncForm.autoStart,
          password: password
        })
      });
      await mutateConfig();
      setPassword("");
      showToast(t("settings.remoteDesktop.saveSuccess"), "success");
    } catch (err) {
      showToast(t("settings.remoteDesktop.saveFailure", { message: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <h3 className="panel-title flex items-center gap-2">
          <Monitor size={18} /> {t("settings.remoteDesktop.title")}
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="vnc-port" className="block text-sm text-slate-400 mb-1">{t("settings.remoteDesktop.port")}</label>
            <input
              type="number"
              id="vnc-port"
              min={1024}
              max={65535}
              className="input-text w-32"
              value={vncForm.port}
              onChange={(e) => {
                const updated = { ...vncForm, port: parseInt(e.target.value) || 5900 };
                setVncForm(updated);
                debouncedSaveVnc(updated, false);
              }}
            />
          </div>

          <ToggleBar
            label="Start automatically"
            description="Start VNC server when application launches"
            enabled={vncForm.autoStart ?? false}
            onChange={async (enabled) => {
              try {
                const updated = { ...vncForm, autoStart: enabled };
                setVncForm(updated);
                await api("/api/vnc/config", {
                  method: "PUT",
                  body: JSON.stringify({
                    enabled: true,
                    port: vncForm.port,
                    allowRemote: vncForm.allowRemote,
                    autoStart: enabled,
                    password: undefined
                  })
                });
                await mutateConfig();
                showToast(t("common.success"), "success");
              } catch (error) {
                showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            icon={<Monitor size={18} />}
          />

          <ToggleBar
            label={t("settings.remoteDesktop.allowRemote")}
            description="Allow connections from other machines"
            enabled={vncForm.allowRemote}
            onChange={async (enabled) => {
              try {
                const updated = { ...vncForm, allowRemote: enabled };
                setVncForm(updated);
                await api("/api/vnc/config", {
                  method: "PUT",
                  body: JSON.stringify({
                    enabled: true,
                    port: vncForm.port,
                    allowRemote: enabled,
                    autoStart: vncForm.autoStart,
                    password: undefined
                  })
                });
                await mutateConfig();
                showToast(t("common.success"), "success");
              } catch (error) {
                showToast(`${t("common.error")}: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            icon={<Globe size={18} />}
          />

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

          <div className="pt-2 border-t border-slate-800">
            <label htmlFor="vnc-password" className="block text-sm text-slate-400 mb-2">{t("settings.remoteDesktop.password")}</label>
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
              <button
                className="btn-primary"
                onClick={handleSetPassword}
                disabled={isSavingPassword || !password}
              >
                <Save size={16} /> {isSavingPassword ? "Saving..." : "Set Password"}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">{t("settings.remoteDesktop.passwordHint")}</p>
          </div>
        </div>
      </div>

      {/* VNC Recording Settings */}
      <VncRecordingSettingsPanel />
    </div>
  );
}

function VncRecordingSettingsPanel() {
  const { t } = useTranslation();

  const { data: recordingConfig, mutate: mutateRecordingConfig } = useSWR<VncRecordingOptions>(
    "vnc-recording-config",
    () => api<VncRecordingOptions>("/api/vnc/recordings/config")
  );

  const [form, setForm] = useState<VncRecordingOptions>({
    rootFolder: "",
    maxRecordingDurationMinutes: 120,
    retentionDays: 30,
    enableMotionDetection: false,
    motionDetectionThresholdPercent: 10,
    motionDetectionBlockSize: 32,
    motionDetectionPauseDelaySeconds: 10,
    recordingFps: 5,
    useProfileSubfolders: true
  });

  const [showRecordingFolderPicker, setShowRecordingFolderPicker] = useState(false);

  useEffect(() => {
    if (recordingConfig) {
      setForm(recordingConfig);
    }
  }, [recordingConfig]);

  // Debounced save for text/number inputs
  const debouncedSaveRecording = useDebouncedSave(
    async (data: VncRecordingOptions) => {
      await api("/api/vnc/recordings/config", {
        method: "PUT",
        body: JSON.stringify(data)
      });
    },
    mutateRecordingConfig,
    500
  );

  return (
    <div className="panel space-y-4">
      <h3 className="panel-title flex items-center gap-2">
        <Video size={18} /> VNC Recording
      </h3>

      <div className="space-y-4">
        <div>
          <label htmlFor="recording-folder" className="block text-sm text-slate-400 mb-1">
            Recordings Folder
          </label>
          <div className="flex gap-2">
            <input
              className="input-text flex-1"
              value={formatPath(form.rootFolder)}
              onChange={(e) => {
                const normalized = e.target.value.replace(/\\\\/g, '\\');
                const updated = { ...form, rootFolder: normalized };
                setForm(updated);
                debouncedSaveRecording(updated, false);
              }}
            />
            <button
              className="btn-outline"
              type="button"
              onClick={() => setShowRecordingFolderPicker(true)}
            >
              <FolderOpen size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Default location for VNC session recordings
          </p>
        </div>

        <ToggleBar
          label="Use profile-specific subfolders"
          description="Organize recordings by VNC profile"
          enabled={form.useProfileSubfolders}
          onChange={async (enabled) => {
            try {
              const updated = { ...form, useProfileSubfolders: enabled };
              setForm(updated);
              await api("/api/vnc/recordings/config", {
                method: "PUT",
                body: JSON.stringify(updated)
              });
              await mutateRecordingConfig();
              showToast("Settings saved successfully", "success");
            } catch (error) {
              showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
            }
          }}
          icon={<FolderOpen size={18} />}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="max-duration" className="block text-sm text-slate-400 mb-1">
              Max Recording Duration (minutes)
            </label>
            <input
              type="number"
              id="max-duration"
              min={1}
              max={480}
              className="input-text w-full"
              value={form.maxRecordingDurationMinutes}
              onChange={(e) => {
                const updated = { ...form, maxRecordingDurationMinutes: parseInt(e.target.value) || 120 };
                setForm(updated);
                debouncedSaveRecording(updated, false);
              }}
            />
          </div>

          <div>
            <label htmlFor="retention-days" className="block text-sm text-slate-400 mb-1">
              Retention Period (days)
            </label>
            <input
              type="number"
              id="retention-days"
              min={1}
              max={365}
              className="input-text w-full"
              value={form.retentionDays}
              onChange={(e) => {
                const updated = { ...form, retentionDays: parseInt(e.target.value) || 30 };
                setForm(updated);
                debouncedSaveRecording(updated, false);
              }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="recording-fps" className="block text-sm text-slate-400 mb-1">
            Recording FPS: {form.recordingFps}
          </label>
          <input
            type="range"
            id="recording-fps"
            min={1}
            max={30}
            className="w-full"
            value={form.recordingFps}
            onChange={(e) => {
              const updated = { ...form, recordingFps: parseInt(e.target.value) };
              setForm(updated);
              debouncedSaveRecording(updated, false);
            }}
          />
          <p className="text-xs text-slate-500 mt-1">
            Lower FPS reduces file size but may result in choppy playback
          </p>
        </div>

        <div className="space-y-3">
          <ToggleBar
            label="Enable Motion Detection"
            description="Only record when screen changes are detected"
            enabled={form.enableMotionDetection}
            onChange={async (enabled) => {
              try {
                const updated = { ...form, enableMotionDetection: enabled };
                setForm(updated);
                await api("/api/vnc/recordings/config", {
                  method: "PUT",
                  body: JSON.stringify(updated)
                });
                await mutateRecordingConfig();
                showToast("Settings saved successfully", "success");
              } catch (error) {
                showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
              }
            }}
            icon={<Video size={18} />}
          />

          {form.enableMotionDetection && (
            <div className="ml-6 space-y-3 border-l-2 border-blue-500/30 pl-4">
              <div>
                <label htmlFor="motion-threshold" className="block text-sm text-slate-400 mb-1">
                  Motion Sensitivity: {form.motionDetectionThresholdPercent}%
                </label>
                <input
                  type="range"
                  id="motion-threshold"
                  min={1}
                  max={50}
                  className="w-full"
                  value={form.motionDetectionThresholdPercent}
                  onChange={(e) => {
                    const updated = { ...form, motionDetectionThresholdPercent: parseInt(e.target.value) };
                    setForm(updated);
                    debouncedSaveRecording(updated, false);
                  }}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Lower values = more sensitive (records with less change)
                </p>
              </div>

              <div>
                <label htmlFor="block-size" className="block text-sm text-slate-400 mb-1">
                  Detection Block Size
                </label>
                <select
                  id="block-size"
                  className="input-text w-full"
                  value={form.motionDetectionBlockSize}
                  onChange={async (e) => {
                    const blockSize = parseInt(e.target.value);
                    const updated = { ...form, motionDetectionBlockSize: blockSize };
                    setForm(updated);
                    // Immediate save for select
                    try {
                      await api("/api/vnc/recordings/config", {
                        method: "PUT",
                        body: JSON.stringify(updated)
                      });
                      await mutateRecordingConfig();
                      showToast("Block size saved successfully", "success");
                    } catch (error) {
                      showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
                    }
                  }}
                >
                  <option value={16}>16x16 (High precision, higher CPU)</option>
                  <option value={32}>32x32 (Balanced)</option>
                  <option value={64}>64x64 (Low precision, lower CPU)</option>
                </select>
              </div>

              <div>
                <label htmlFor="pause-delay" className="block text-sm text-slate-400 mb-1">
                  Pause Delay: {form.motionDetectionPauseDelaySeconds} seconds
                </label>
                <input
                  type="range"
                  id="pause-delay"
                  min={1}
                  max={60}
                  className="w-full"
                  value={form.motionDetectionPauseDelaySeconds}
                  onChange={(e) => {
                    const updated = { ...form, motionDetectionPauseDelaySeconds: parseInt(e.target.value) };
                    setForm(updated);
                    debouncedSaveRecording(updated, false);
                  }}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Time to wait before pausing recording when no motion is detected
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showRecordingFolderPicker && (
        <FolderPicker
          initialPath={form.rootFolder}
          onSelect={async (path) => {
            const normalized = path.replace(/\\\\/g, '\\');
            const updated = { ...form, rootFolder: normalized };
            setForm(updated);
            setShowRecordingFolderPicker(false);
            // Immediate save for folder picker
            try {
              await api("/api/vnc/recordings/config", {
                method: "PUT",
                body: JSON.stringify(updated)
              });
              await mutateRecordingConfig();
              showToast("Recordings folder saved successfully", "success");
            } catch (error) {
              showToast(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
            }
          }}
          onCancel={() => setShowRecordingFolderPicker(false)}
        />
      )}
    </div>
  );
}
