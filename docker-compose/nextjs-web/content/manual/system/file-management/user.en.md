---
title: "File Management — User Manual"
description: "An app that lets you open and look at the files kept in the system, just like folders on your computer."
screenshots: [settings-files-grants-01]
---
This app lets you **open and look at** the files kept in the system, just like folders on your computer. The operation code is `SY06`.

It holds the files you uploaded yourself, and also the PDFs the system made for you automatically, such as quotes and invoices.

## What you can do with this app

- Move through folders and see the files inside them.
- Pick a file and check its contents on the right-hand side (images and PDFs).
- **Download** a file, or **open** it in a new tab.
- **Upload** files into the folders you are allowed to.
- Look for a file by name across every folder.
- A system administrator can decide, person by person, who may look inside which folder.

## Words used on this page

- **Folder** … a container that holds files. The same idea as a folder on your computer.
- **System file** … a file **the system made automatically**, rather than one a person uploaded. Quote and invoice PDFs are examples.
- **Folder permission** … a rule that says "this person may look inside this folder". A system administrator sets it.

## Before you start

- Anyone who is logged in can open this app. No special permission is needed.
- However, **different people see different files**. Only the files that concern you are shown. What you see depends on the following.
  1. System administrators … see every file.
  2. People who have been allowed a folder … see what is inside that folder.
  3. People who have permission for an app … see the PDFs that app made. For example, someone who can use quotes sees the quote PDFs.

## How to open it

On the home screen, under 「システム」 (System), press **ファイル管理** (File Management). Or type `SY06` into the search box at the top of the screen.

## Reading the screen

- Your current location is shown across the top of the screen, starting from 「**すべて**」 (All). Click any part of it to go back to that place.
- 「**名前**」 (Name) … the name of the file or folder. PDFs get a red mark, images a blue one.
- 「**サイズ**」 (Size) … how big the file is.
- 「**更新日時**」 (Updated) … when it was last saved.
- A file with a grey 「**システム**」 (System) mark next to its name was made automatically by the system.
- Click a folder to go inside it. Click a file and its contents appear on the right.

At the top right of the screen you will find these buttons.

- 「**更新**」 (Refresh) … reloads the screen so it shows the latest state.
- 「**アップロード**」 (Upload) … adds a file. It only appears **when you are in a folder you are allowed to write to**.
- 「**フォルダ権限**」 (Folder permissions) … only system administrators see this.

## Changing how files are laid out

The three marks at the top left of the screen change the layout. Hover your mouse over a mark to see its name.

- 「**リスト**」 (List) … the usual view, with name, size, and updated date in a row.
- 「**アイコン**」 (Icons) … lays files out with larger marks. Handy when you are looking for a photo.
- 「**カラム**」 (Columns) … shows the folder levels side by side, left to right. Handy when you are going deep into folders.

Where there is nothing inside, you will see 「**空のフォルダ**」 (Empty folder).

## Finding a file

1. In the search box at the top, 「**ファイル名・パスで検索（全フォルダ横断）**」 (Search by file name or path (across all folders)), type part of the file name.
2. Every file with a matching name is listed, no matter which folder it is in.
3. When you are done searching, delete the text you typed.

> 💡 If a quote or invoice PDF does not appear, turn on the 「**システムファイル**」 (System files) switch. Files the system made are normally hidden.

## Opening and downloading a file

1. Click the file you want to see.
2. Its contents appear on the right. Images and PDFs can be checked right there.
3. Press 「**開く**」 (Open) to show it larger in a new tab.
4. Press 「**ダウンロード**」 (Download) to save it to your computer.

The right-hand side also shows 「**パス**」 (Path — where it is kept), 「**サイズ**」 (Size), 「**更新日時**」 (Updated), and 「**種類**」 (Type).

## Uploading a file

1. Open the folder you want to put it in.
2. Press 「**アップロード**」 (Upload) at the top right of the screen.
3. Choose the file from your computer.
4. When 「**アップロードしました**」 (Uploaded) appears, you are done.

> 💡 When the file is saved, a date and some other text are added automatically to the front of the file name. This stops a file with the same name from being overwritten, and lets you tell later when the file was put in. The contents do not change.

If you cannot find the 「**アップロード**」 button, you are not allowed to put files into that folder. Please ask your system administrator.

## Deleting a file

1. Click the file you want to delete.
2. Press 「**削除**」 (Delete) on the right-hand side.
3. A confirmation titled 「**ファイルの削除**」 (Delete file) appears. Read it and press 「**削除**」. To stop, press 「**戻る**」 (Back).

> ⚠️ **A deleted file cannot be brought back.** Quote and invoice PDFs are referred to from the screens of those documents. Please do not delete files that belong to business paperwork.

If a file has no 「**削除**」 button, you are not allowed to delete it.

## Deciding who may look inside a folder (system administrators only)

Set this from 「**フォルダ権限**」 (Folder permissions) at the top right of the screen.

1. Press 「**フォルダ権限**」.
2. In 「**フォルダ（パス前方一致）**」 (Folder (matches the start of the path)), type the folder you want to allow. **Everything inside that folder is covered.**
3. In 「**ユーザー**」 (User), choose the person you are allowing.
4. If you also want them to add and remove files, turn on 「**書き込みも許可**」 (Also allow writing). If looking is enough, leave it as it is.
5. Press 「**付与**」 (Grant).

![The folder permissions screen](../../assets/screenshots/settings-files-grants-01.png)

Below, under 「**付与済み**」 (Granted), you will see what is currently allowed. 「**読み書き**」 (Read and write) means the person can look, add, and remove; 「**読み取り**」 (Read only) means they can only look. To take it back, press 「**削除**」 on that row.

When no one has been allowed anything yet, you will see 「**個別付与はありません**」 (No individual grants).

## Questions and problems

**Q. A red box at the top of the screen says 「ストレージ（SeaweedFS）に接続できません。SEAWEED_FILER_URL とコンテナの稼働状況をご確認ください。」 (Cannot connect to storage (SeaweedFS). Please check SEAWEED_FILER_URL and whether the container is running.)**
A. The equipment that keeps the files has stopped. While this lasts, the file list will not appear. Please contact your system administrator.

**Q. A file that should be there is missing.**
A. There are two likely reasons. One is that it is a file the system made, so it is hidden — try turning on the 「**システムファイル**」 (System files) switch. The other is that you are not allowed to look inside that folder. Please ask your system administrator.

**Q. There is no 「アップロード」 button.**
A. You are not allowed to put files into the folder you have open. Move to a different folder, or ask your system administrator.

**Q. I got 「アップロード失敗」 (Upload failed).**
A. If it appears together with 「**このフォルダへのアップロード権限がありません**」 (You do not have permission to upload to this folder), you are not allowed to put files into that folder. Otherwise it may be a connection problem. Please try again.

**Q. I deleted a file by mistake.**
A. It cannot be brought back from this screen. Please ask your system administrator about restoring it from a backup.

**Q. The file name changed after I uploaded it.**
A. That is normal. A date and some other text are added automatically so a file with the same name is not overwritten. The contents are unchanged.
