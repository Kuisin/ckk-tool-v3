---
title: "Setting up a display (Raspberry Pi)"
description: "How to prepare, connect and register the small computer (Raspberry Pi) that shows production status on a shop-floor TV. Written so that anyone can follow it, no computer knowledge needed."
---

How to put a TV on the shop floor that shows production status. **You do not need
to know anything about computers — just follow the steps in order.**

It takes about **30 minutes**, and about 15 of those are waiting.

> 💡 There is nothing difficult to configure. What the TV shows is chosen later,
> from a PC. You do not choose it during this work.

## What you can do here

- Prepare the small computer that drives the TV
- Connect it to the TV and switch it on
- Drive two TVs from one unit, each showing its own screen
- Register the display using the link code shown on the screen
- Fix the common problems

## Words used on this page

- **Raspberry Pi** … A small computer, about the size of your hand. You connect
  it to the TV.
- **microSD card** … A small memory card that goes inside the Raspberry Pi.
  It holds everything the computer needs to start.
- **Link code** … 12 letters and numbers shown on the TV. It tells the system
  which screen you are setting up — the same mechanism shared tablets use.

## What you need

| Item | Notes |
|---|---|
| Raspberry Pi 5 | 4GB is enough |
| Official power supply | **Use the official one** |
| microSD card | 32GB or larger. Look for "A2" (high endurance) |
| HDMI cable | The Raspberry Pi end is the small "micro HDMI" shape |
| LAN cable | Wi-Fi works, but a cable is more reliable |
| USB keyboard | Needed only once, at the start |
| A PC that can read microSD cards | Only for the preparation step |

> ⚠️ Use a **power supply made for the Raspberry Pi 5**. A phone charger does not
> supply enough power, and you get "the screen goes blank sometimes" — the
> hardest kind of fault to track down.

## 1. Prepare the microSD card

Do this on a PC.

1. Install **Raspberry Pi Imager** on the PC (free, from `raspberrypi.com`).
2. Put the microSD card into the PC.
3. Open Raspberry Pi Imager.
4. Press "Choose device" and select **Raspberry Pi 5**.
5. Press "Choose OS" and select **Raspberry Pi OS (64-bit)**.
6. Press "Choose storage" and select the microSD card.
7. Press "Next".
8. Press "Edit settings".

Now add a few settings that save work later.

9. Set "hostname" to something recognisable (for example `ckk-display-1`).
10. Tick "Set username and password", then choose a username and password.
    **Write the password down.**
11. If you will use Wi-Fi, tick "Configure wireless LAN" and enter the network
    name and password.
12. Open the "Services" tab and tick "Enable SSH".
13. Press "Save", then "Yes" to start writing.

Writing takes 5–10 minutes. When it finishes, remove the card.

> 💡 Doing steps 9–12 now means you only need the keyboard once later.

## 2. Connect it to the TV

1. Push the microSD card fully into the slot on the underside of the Raspberry Pi.
2. Connect the Raspberry Pi to the TV with the HDMI cable. On the Raspberry Pi,
   use the socket nearer the power connector.
3. Connect the LAN cable (skip this if you set up Wi-Fi).
4. Connect the USB keyboard.
5. Connect the power **last**.
6. Switch the TV input to the HDMI socket you used.

The screen appears after a while. The first start takes 2–3 minutes.

## 3. Install the display software

This is the only step that needs the keyboard.

1. Press the black square icon (Terminal) at the top left of the screen.
   If you cannot see it, press `Ctrl`, `Alt` and `T` together.
2. When the black window opens, type this line **exactly as shown**.

```bash
curl -fsSL https://ckk-kiosk.kai-lab.net/rpi/install.sh | bash
```

3. Press `Enter`.
4. If it asks for a password, type the one from step 1 and press `Enter`.
   **Nothing appears on screen while you type, but it is being entered.**
5. Wait about 5 minutes. A lot of text scrolls past — you can ignore it.
6. When it says it has finished, type this line and press `Enter`.

```bash
sudo reboot
```

The Raspberry Pi restarts. **You can unplug the keyboard now.**

> ⚠️ A typing mistake produces an error in English. Just type the same line
> again. You can repeat it as many times as you need.

## 4. Register the display

After restarting, the TV shows a 12-character link code.
**From here it is exactly the same as a shared tablet.**

On a PC, open **Devices (SY09)** and go to the "Displays" tab.

1. Press "Add a display".
2. Enter a name people on the floor will use (for example `Line A entrance`).
3. Choose the location, site and screen, then press "Create".
   (A new display starts on "Production status"; you can change it later.)
4. Press "Link" on the new row in the list.
5. Press "Scan the display's QR" and scan the QR shown on the TV.
   (If it will not scan, type the 12 characters into the box instead.)
6. When the state becomes "Awaiting activation", press "Activate".

The TV changes within a few seconds. The display is now set up.

> 💡 Steps 1–3 can be done before the TV is ready. Doing them in advance
> leaves only linking and activating to do on site.

> ⚠️ The link code expires after **10 minutes**. If that happens, press
> "Issue a new code" on the TV, or switch the Raspberry Pi off and on again.

## Driving two TVs from one Raspberry Pi

A Raspberry Pi 5 has two HDMI sockets, so one unit can show **different content**
on two TVs.

Run step 3 with `--screens 2`:

```bash
curl -fsSL https://ckk-kiosk.kai-lab.net/rpi/install.sh | bash -s -- --screens 2
```

> 💡 Run it without the option and it counts the connected TVs itself. Only pass
> `--screens` when that count comes out wrong.

After restarting, **each TV shows its own link code**. Do step 4 once per TV
(twice in total). Each screen says "screen 1 of 2 on this machine", so you know
which code you are typing.

Once registered, the two TVs are **entirely separate displays**. The screen and
scale are set per screen, and disabling one leaves the other running.

> ⚠️ If left and right come out swapped, swapping the HDMI cables is the
> easiest fix.

## Changing things later

**You never need to touch the Raspberry Pi.** Use the "Displays" tab of
**Devices (SY09)** on a PC.

| What you want | How |
|---|---|
| Change what it shows | Open the display, "Content" tab, Edit, pick, press Save |
| Fix the name or location | Open the display, edit, press Save |
| Stop it for now | Open the display, press "Disable" |
| Move it elsewhere | Open the display, press "Unlink" (settings are kept) |
| Stop using it | Open the display, press "Revoke" |

"Unlink" keeps the name and screen choice but releases the TV — handy when you
want to use the same settings with a different Raspberry Pi. After "Revoke" the
screen goes back to showing a link code.

## Questions and problems

**Q. The TV shows nothing (black screen)**
A. Check the TV input is set to the HDMI socket you used. If it still shows
nothing, move the HDMI cable to the other socket on the Raspberry Pi.

**Q. The screen says it cannot connect**
A. Check the LAN cable. The normal display comes back on its own once the
network returns. You do not have to do anything.

**Q. It went back to the link code screen**
A. That display has been revoked or disabled. Check its state in the Displays
tab of Devices (SY09). To use it again, register it with the code shown.

**Q. The power went off. Do I have to set it up again?**
A. No. Switch it on and it returns to the same display by itself.

**Q. The information looks out of date**
A. The content reloads on a set interval. To refresh it immediately, switch the
Raspberry Pi off and on again.

**Q. I want to make a second one**
A. Repeat steps 1 to 4. The microSD card you make in step 1 is the same for
every display. If you need many of them, ask the IT team — there is a copying
procedure in `external/rpi-display/README.md`.

## For the IT team

The technical notes (how autostart works, cloning the image, updating) are in
`external/rpi-display/README.md` in the repository.

To point a display at the test environment (dev), replace the line in step 3
with this one.

```bash
curl -fsSL https://ckk-kiosk-dev.kai-lab.net/rpi/install.sh | bash -s -- --dev
```
