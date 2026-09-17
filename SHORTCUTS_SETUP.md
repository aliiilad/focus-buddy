# iPhone setup

Do this once, after the site is online (see README → "Put it online"). Yours is **https://aliiilad.github.io/focus-buddy/**

There are three parts:

| Step | What it does | Can you get around it alone? |
|---|---|---|
| 0. Screen Time limit + a friend's passcode | Hard daily ceiling on social apps | **No** |
| 1. "FB Unlock" shortcut | Remembers "unlocked until …" | n/a |
| 2. Gate automation | Sends you to Focus Buddy when you open a social app | Yes, by turning it off (on purpose, not on autopilot) |

---

## Step 0: Hard ceiling (built into iOS, free)

1. **Settings → Screen Time → App Limits → Add Limit.**
2. Pick your social apps (or the whole *Social* category). Set a daily limit, for example **45 min**.
3. Make sure **Block at End of Limit** is on.
4. **Settings → Screen Time → Lock Screen Time Settings**, and have a **friend type in a passcode you don't know**.

Now even if you get around Focus Buddy, you can't go over 45 minutes a day.

## Step 1: The "FB Unlock" shortcut

Open **Shortcuts → My Shortcuts → +**. Name it exactly **`FB Unlock`** (capital F and B, one space). Add these actions in order (search for each by name):

1. **Get Numbers from Input.** Tap *Input* and choose **Shortcut Input**.
2. **Adjust Date.** Set it to *Add* → tap *0* and pick the **Numbers** variable → unit **minutes** → date: **Current Date**.
3. **Format Date.** Date: **Adjusted Date**. Tap *Date Format* → **ISO 8601**.
4. **Save File.**
   - File: **Formatted Date**
   - Tap the arrow to expand it and turn **Ask Where to Save** off
   - Destination path: `FocusBuddy/until.txt`
   - **Overwrite If File Exists**: on
5. **Show Notification**: `Unlocked. Go back to your app.`

At the top, tap the shortcut name → **Details**. If "Receive … input from" appears, allow **Text**.

> Test: in Safari, go to `shortcuts://run-shortcut?name=FB%20Unlock&input=text&text=1`. You should see the notification. The first time, iOS may ask for permission to save a file. Tap **Always Allow**.

## Step 2: The gate automation

**Shortcuts → Automation → + → App.**

1. **App:** choose Instagram, TikTok, YouTube, X, and any others. **Is Opened** checked.
2. Choose **Run Immediately**. Turn **Notify When Run** off.
3. **New Blank Automation**, then add:
   1. **Get File from Folder.** Folder: **Shortcuts**. Path: `FocusBuddy/until.txt`. **Error If Not Found**: off.
   2. **Get Dates from Input.** Input: **File**.
   3. **If** → **Dates** → **is after** → **Current Date**.
      - Inside the *If*: **Stop This Shortcut**.
   4. After **End If**: **Open URLs** → `https://aliiilad.github.io/focus-buddy/?from=a%20social%20app`

(Want the page to say the app's name? Make one automation per app and use, for example, `?from=Instagram`.)

> Test: open Instagram. Safari should jump to Focus Buddy saying "Work first". Earn or spend minutes, tap **Unlock**, then go back to Instagram. It should stay open this time.

## Rules of thumb

- **Always use Safari.** Don't "Add to Home Screen". The home screen copy keeps a separate memory and won't see your earned minutes.
- Apps re-lock the **next time** you open them after your minutes run out, not while you're inside the app. Keep unlocks short (the default is 10 min).
- If you turn the automation off "just for a minute", that's the moment to notice. The research says usage bounces back fast once the friction is gone.

## Bonus: grayscale (research-backed, ~38 min/day less screen time)

**Settings → Accessibility → Display & Text Size → Color Filters** → turn on **Grayscale**, then turn Color Filters off again.
Then **Settings → Accessibility → Accessibility Shortcut → Color Filters**. Triple-click the side button to switch grayscale on or off.
