---
title: "Approval Group — User Manual"
description: "An app for deciding who can approve, by group. You can also register a stand-in who approves for someone who is away, for a set period."
screenshots: [master-approval-group-list-01, master-approval-group-new-01, master-approval-group-members-01, master-approval-group-member-add-01, master-approval-group-delegate-add-01]
---
This app is for deciding **who can approve**, by group. The operation code is `MS0B`.

When approval is asked for on a work order, a material purchase order and so on, the people in that group become able to approve it. **A person who is not in the group cannot approve.** The other way round, if you add a person to the group as a member, that person becomes able to approve.

## What you can do with this app

- You can make groups of people who approve.
- You can add and remove **members** (the people who can approve) in a group.
- When the person in charge is away on a business trip or on holiday, you can register a **stand-in** (a person who approves instead) for a set period.
- You can stop a group you no longer use without deleting any records.

## Words used on this page

- **Approval** … checking the content and agreeing that it may go ahead.
- **Group** … a set of people who can approve. An approval request goes to this group, not to a person.
- **Member** … a person who can approve in that group. Only the people in it can approve.
- **Stand-in** … a person who approves instead, for a set period, when the real approver is away.
- **Type** … which stage of approval that group is in charge of.

## Before you start

- You need the **master permission** to use this app.
- Only people already registered in the system can be added as members. If a name does not appear, please check that their company account has been created first.

## There are three types (the role of the group)

When you make a group, you choose which stage of approval it is in charge of. **It cannot be changed after you make it.**

- **第一承認** (first approval) … the first approval, such as "may we produce this as it is?".
- **第二承認** (second approval) … the approval by the department, done after the first approval.
- **ワークフロー変更承認** (workflow change approval) … the approval for changing the steps of a work order that is already running.

## How to read the screen

When you open the app, a list of the registered groups is shown.

![List screen of approval groups](../../assets/screenshots/master-approval-group-list-01.png)

- The list columns are **名称** (name) / **種別** (type) / **メンバー数** (number of members) / **状態** (status).
- Use the 「**名称で検索**」 (search by name) box at the top to narrow down to the group you are looking for. You can also narrow it by 「**種別**」 (type) and 「**状態**」 (status).
- Click a row to open the detail screen of that group.

## Make a group

1. Press 「**新規作成**」 (New) at the top right of the list screen.
2. Choose 「**種別**」 (type): first approval, second approval or workflow change approval.
3. Enter the name of the group in the Japanese box of 「**名称**」 (name), for example 第一承認グループ (first approval group). You can save with the English box left empty.
4. Press 「**保存**」 (Save).

![New entry form for an approval group](../../assets/screenshots/master-approval-group-new-01.png)

When you save, the detail screen opens. You add the members there.

> ⚠️ 「**種別**」 (type) cannot be changed after you save. The edit screen also shows 「**種別は作成後変更できません**」 (the type cannot be changed after creation). If you chose the wrong stage, make a new group with the right type.

## Add a member (add someone who can approve)

1. On the detail screen of the group, open the 「**メンバー**」 (members) tab.
2. Press 「**メンバーを追加**」 (Add member).
3. Type a name in the 「**氏名・ユーザー名で検索**」 (search by name or user name) box and choose the person you want to add.
4. Press 「**追加**」 (Add).

![Members tab of an approval group](../../assets/screenshots/master-approval-group-members-01.png)

![Screen for adding a member](../../assets/screenshots/master-approval-group-member-add-01.png)

The person you added can approve from that day.

The member table shows **氏名** (name) / **ユーザー名** (user name) / **状態** (status). Use the buttons at the right of a row to stop that member for a while (「**メンバーを無効化**」, deactivate member) or to take them out of the group (「**メンバーを削除**」, remove member).

> 💡 It is easier to follow if you use "deactivate" when someone is only stepping away from approving for a while, and "remove" when the person is no longer involved at all.

## Register a stand-in (for someone who is away)

When an approver is away on a business trip or on holiday, you can hand approval to another person for a set period.

1. On the detail screen of the group, open the 「**代理設定**」 (stand-in settings) tab.
2. Press 「**代理設定を追加**」 (Add stand-in setting).
3. In 「**原承認者**」 (original approver), choose the real approver. Only the active members of this group appear here.
4. In 「**代理人**」 (stand-in), choose the person who will approve instead.
5. Enter 「**期間（開始日）**」 (period, start date) and 「**期間（終了日）**」 (period, end date).
6. If you need to, write something like "business trip or holiday" in 「**理由**」 (reason). It can be left empty.
7. Press 「**追加**」 (Add).

![Screen for adding a stand-in setting](../../assets/screenshots/master-approval-group-delegate-add-01.png)

Once the registered period has passed, the stand-in stops working by itself. You do not need to remove it by hand. If you want to end it earlier, you can delete the row from the stand-in settings table.

## Check what is in a group

The detail screen is split into four tabs.

- **グループ情報** (group information) … you can check the name and the type.
- **メンバー** (members) … the list of people who can approve.
- **代理設定** (stand-in settings) … the list of stand-ins registered now. The original approver, the stand-in, the period and the reason are shown.
- **履歴** (history) … the record of who changed a member or a stand-in and when.

To correct the name, press 「**編集**」 (Edit) at the top right. From the 「**…**」 (the three-dot button) to its right, you can use **無効化** (Deactivate) and **削除** (Delete).

## Questions and problems

**Q. Someone was asked to approve, but says they cannot.**
A. Check whether that person is a member of the group. Even if they are in it, they cannot approve while their 「状態」 (status) is inactive. Add them or make them active again from the 「メンバー」 (members) tab.

**Q. I see 「既にメンバーです」 (this person is already a member).**
A. That person is already in this group. Look for the name in the list on the 「メンバー」 (members) tab. If they are inactive, you can make them active again with the button on the row.

**Q. I see 「原承認者はこのグループの有効なメンバーのみ選べます」 (only active members of this group can be chosen as the original approver).**
A. The real approver you want to hand over from is not a member of this group, or is inactive. First add or activate that person on the 「メンバー」 (members) tab.

**Q. I see 「原承認者と代理人は別のユーザーを選択してください」 (please choose different users for the original approver and the stand-in).**
A. You have chosen the same person for both. Choose a different person as the one who approves instead.

**Q. I see 「終了日は開始日以降の日付を選択してください」 (please choose an end date that is the same as or later than the start date).**
A. The end date is before the start date. Please enter the dates again.

**Q. The period of a stand-in has ended, but the setting is still there.**
A. A stand-in whose period has passed stops working by itself, so there is no problem if it is still listed. If you want to tidy up the list, delete the row.

**Q. I cannot delete a group.**
A. It cannot be deleted while there are approval requests or stand-in settings that used that group. For a group you no longer use, choose 「**無効化**」 (Deactivate) instead of deleting. Once it is inactive it is no longer used for new approvals, and the past records stay as they are.
