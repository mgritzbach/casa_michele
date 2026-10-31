package com.casamichele.app;

import static org.junit.Assert.*;

import android.content.Intent;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs only on the disposable CI emulator. No production event is created. */
@RunWith(AndroidJUnit4.class)
public class OfflineWorkspaceTest {
    private ActivityScenario<MainActivity> scenario;

    private String js(String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
            expression, result -> { value.set(result); done.countDown(); }
        ));
        assertTrue("WebView did not respond", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }

    private void waitFor(String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 30000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(js(expression))) return;
            Thread.sleep(150);
        }
        fail("Condition did not become true: " + expression + "; page=" + js("document.body.innerText"));
    }

    private void click(String text) throws Exception {
        String escaped = text.replace("'", "\\'");
        waitFor("Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '" + escaped + "')");
        js("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '" + escaped + "').click()");
    }

    private void shell(String command) throws Exception {
        try (android.os.ParcelFileDescriptor result = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation().executeShellCommand(command)) {
            try (java.io.InputStream stream = new android.os.ParcelFileDescriptor.AutoCloseInputStream(result)) {
                while (stream.read() != -1) { /* wait for the command to finish */ }
            }
        }
    }

    @Test public void firstRunOfflineWorkSurvivesRestartAndJoinLinksResolve() throws Exception {
        shell("svc wifi disable");
        shell("svc data disable");
        try {
            scenario = ActivityScenario.launch(MainActivity.class);
            click("Bartender access");
            click("Start a local offline bar");
            waitFor("document.body.innerText.includes('Local bar on this device')");
            click("Recipes");
            waitFor("document.querySelectorAll('[aria-label^=\"View \"]').length === 41");
            js("document.querySelector('[aria-label=\"View Negroni\"]').click()");
            waitFor("document.querySelector('[role=dialog]')?.textContent.includes('3cl Gin')");
            waitFor("Array.from(document.querySelectorAll('[role=dialog] img')).some(i => i.complete && i.naturalWidth > 0)");
            click("Add walk-in order");
            waitFor("document.body.innerText.includes('1 saved change')");
            click("Done");
            waitFor("document.body.innerText.includes('2 saved changes')");
            scenario.close();
            scenario = ActivityScenario.launch(MainActivity.class);
            waitFor("document.body.innerText.includes('2 saved changes') && document.body.innerText.includes('Negroni') && document.body.innerText.includes('DONE')");
            click("Stock");
            js("document.querySelector('[aria-label=\"Gin in stock\"]').click()");
            waitFor("document.body.innerText.includes('3 saved changes')");
            js("document.querySelector('[aria-label=\"Allow out-of-stock drinks for guests to order\"]').click()");
            waitFor("document.body.innerText.includes('4 saved changes')");
            click("Recipes");
            waitFor("document.querySelector('[aria-label=\"View Negroni\"]')?.textContent.includes('Missing: Gin')");
            assertEquals("true", js("document.querySelector('[aria-label=\"View Negroni\"]').classList.contains('stock-unavailable')"));
            click("Makeable only");
            waitFor("!document.querySelector('[aria-label=\"View Negroni\"]') && document.querySelectorAll('[aria-label^=\"View \"]').length > 0");
            scenario.close();
            scenario = ActivityScenario.launch(MainActivity.class);
            waitFor("document.body.innerText.includes('4 saved changes')");
            click("Stock");
            waitFor("document.querySelector('[aria-label=\"Allow out-of-stock drinks for guests to order\"]')?.getAttribute('aria-pressed') === 'true'");
            assertEquals("true", js("document.querySelector('[aria-label=\"Gin in stock\"]').getAttribute('aria-checked') === 'false'"));
            assertEquals("true", js("document.documentElement.scrollWidth <= innerWidth"));
            scenario.close();

            android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
            for (String link : new String[] {"casamichele://join?code=NATIVEQA", "https://casa-michele.mic-gritzbach.workers.dev/?code=NATIVEQA"}) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link)).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.getPackageName());
                assertFalse("Missing native intent handler for " + link, context.getPackageManager().queryIntentActivities(intent, 0).isEmpty());
            }
            Intent launch = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("casamichele://join?code=NATIVEQA")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            scenario = ActivityScenario.launch(launch);
            scenario.onActivity(activity -> assertEquals("casamichele://join?code=NATIVEQA", activity.getBridge().getIntentUri().toString()));
            waitFor("!!window.Capacitor?.Plugins?.App");
            assertEquals("true", js("window.Capacitor.isNativePlatform()"));
            js("window.Capacitor.Plugins.App.getLaunchUrl().then(r => window.casaTestLaunch = r?.url).catch(e => window.casaTestLaunch = String(e))");
            waitFor("window.casaTestLaunch === 'casamichele://join?code=NATIVEQA'");
            waitFor("document.body.innerText.includes('Internet needed for guests')");
            waitFor("document.body.innerText.includes('NATIVEQA')");
            context.startActivity(new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://casa-michele.mic-gritzbach.workers.dev/?code=NATIVEQB"))
                .setPackage(context.getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitFor("document.body.innerText.includes('NATIVEQB') && !document.body.innerText.includes('NATIVEQA')");
            scenario.onActivity(activity -> activity.getOnBackPressedDispatcher().onBackPressed());
            waitFor("document.body.innerText.includes('A seat at')");
        } finally {
            if (scenario != null) scenario.close();
            shell("svc wifi enable");
            shell("svc data enable");
        }
    }
}
