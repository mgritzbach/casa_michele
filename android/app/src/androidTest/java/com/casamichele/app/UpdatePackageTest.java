package com.casamichele.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class UpdatePackageTest {
    private void shell(String command) throws Exception {
        try (android.os.ParcelFileDescriptor result = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
             InputStream stream = new android.os.ParcelFileDescriptor.AutoCloseInputStream(result)) {
            while (stream.read() != -1) { }
        }
    }
    @Test public void validatesUpdateAndOpensAndroidConfirmation() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File folder = new File(context.getCacheDir(), "updates"); folder.mkdirs();
        File fixture = new File(folder, "fixture.apk");
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("update-fixture.apk");
             OutputStream out = new FileOutputStream(fixture)) { byte[] buffer = new byte[32768]; int n; while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n); }
        assertFalse(CasaUpdaterPlugin.validReleaseUrl("https://example.com/update.apk"));
        assertFalse(CasaUpdaterPlugin.validReleaseUrl("https://github.com.evil/mgritzbach/casa_michele/releases/download/v5.2.0-preview/CasaMichele-v5.2.0-preview.apk"));
        assertTrue(CasaUpdaterPlugin.validReleaseUrl("https://github.com/mgritzbach/casa_michele/releases/download/v5.2.0-preview/CasaMichele-v5.2.0-preview.apk"));
        String hash = CasaUpdaterPlugin.checksum(fixture);
        CasaUpdaterPlugin.verifyArchive(context, fixture, hash);
        try { CasaUpdaterPlugin.verifyArchive(context, fixture, "0".repeat(64)); fail("Bad checksum accepted"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("verification failed")); }
        File installed = new File(context.getApplicationInfo().sourceDir);
        try { CasaUpdaterPlugin.verifyArchive(context, installed, CasaUpdaterPlugin.checksum(installed)); fail("Same-version update accepted"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("not newer")); }
        Intent intent = CasaUpdaterPlugin.installerIntent(context, fixture);
        assertEquals("content", intent.getData().getScheme());
        assertEquals("application/vnd.android.package-archive", intent.getType());
        assertEquals(context.getPackageName() + ".fileprovider", intent.getData().getAuthority());
        shell("appops set " + context.getPackageName() + " REQUEST_INSTALL_PACKAGES allow");
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            long deadline = System.currentTimeMillis() + 20000;
            boolean confirmation = false;
            while (System.currentTimeMillis() < deadline) {
                AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
                if (root != null && root.getPackageName() != null && root.getPackageName().toString().contains("packageinstaller")
                    && !root.findAccessibilityNodeInfosByText("Update").isEmpty()) { confirmation = true; break; }
                Thread.sleep(250);
            }
            assertTrue("Android update confirmation did not open", confirmation);
        } finally {
            shell("input keyevent 4");
            shell("appops set " + context.getPackageName() + " REQUEST_INSTALL_PACKAGES default");
            fixture.delete();
        }
    }
}
