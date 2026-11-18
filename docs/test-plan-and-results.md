# Wolfie Companion Testing Plan and Results
## Testing Plan

We plan to manually test our features to identify any edge cases, ensure that the application has no bugs, and that it is user-friendly for students. Our testing plan is as follows:
* **Automated and Integration Testing:** We will use Vitest, backend tests, and GitHub Actions to verify functionality, data persistence, and communication between different components in our application.
* **Security and Edge Case Testing:** We will implement tests to validate authentication and ensure user privacy. We will also test how the application handles unexpected inputs and network failures as well as how the application is able to recover without losing students’ work or data. 
* **Student Feedback:** We plan to gather feedback from other students who test our application regarding reliability, overall satisfaction, and convenience, and take their feedback into account when making improvements to our application.
* **Student-Centered and Usability Testing:** During testing, we will evaluate the application’s ease of use and usefulness and whether its features meet students’ everyday academic needs. We will also observe how students interact with the application to identify any confusion or navigation difficulties. 
* **Feature Testing:** We will test first-time and returning student journeys, including account setup, schedule management, messaging, and campus exploration. 

Throughout testing, we will maintain a log of any bugs we found or improvements we made as well as how we fixed them. 

**Our Team's Goal:** Implement the core functionality, enforce the security and privacy controls we actually promise, and clearly document what cannot be guaranteed without university integration.

## Bugs Found and Fixed

* **Previous Interests Logic:** Previously, users could manually type and save their interests. However, we updated this feature to allow users to select interests only from an already defined list. This change led to inconsistencies in the calculation of recommendation scores, since the existing logic included both manually entered interests and interests selected from the new list. To fix this, we updated the logic to include only interests that are selected from the list, ensuring consistency. 

* **Unverified Courses Visibility:** When initially implementing this feature, courses awaiting verification would still display a list of students who had added that course. However, this is unrealistic because unverified courses could be fake. To fix this, we updated the logic so that users cannot view other students enrolled in an unverified course or receive classmate recommendations for that course. Once the course has been verified by us, users will be able to view those features.

* **Failing Course Recommendation Dashboard Tests:** Previously, the logic for student recommendations did not account for different course sections, leading to failing tests. To fix this, we updated the logic to ensure that students are only recommended to others who are enrolled in the same course section and that course verification status is taken into account. 

* **Different Professors Showed the Same Students:** If students added the same course and section but had different professors, they could see students enrolled with the other professor. We fixed this bug by ensuring that courses with the same course code and section but different professors are treated as separate courses on the dashboard, each displaying only students enrolled in that specific course. 

* **Same Course in the Same Semester:** Students were previously able to add duplicate courses during the same semester and academic year, which is unrealistic as students cannot take two of the same classes in a semester. We fixed this bug by ensuring that if a course is already on a student’s dashboard, they cannot add the same course again during that semester and academic year, even if it has a different section or professor.

* **Reminder Notifications False "Read Failed" Bug:** Previously, a newly sent reminder would list “Reading was not saved. Retry read”. React Strict Mode replayed the detail-view effect, so it called our markRead function twice and the detail view treated that as a failed read even if the first call succeeded. 

* **Daylight-Saving Deadline Consistency:** Deadlines during daylight-saving clock changes can be interpreted differently by the planner and reminder system, causing assignments to appear overdue before their actual deadline. The planned fix is to apply the same time-handling rules across both features so deadline statuses and reminders stay consistent.

* **Stuck Message Recovery:** A stalled network request can leave a message stuck on “Sending,” preventing users from editing or retrying it even after reconnecting. The planned fix is to add timeout and recovery handling while preserving the message’s identifier to prevent duplicate sends.

## UI/UX Improvements

* **Back/Forward Navigation:** Users were not able to use backward or forward navigation from the browser bar, doing so would reset the page to the search engine. Now we maintain window history navigation.

* **Scrolling Into View:** Previously, our application pages did not automatically scroll to bring the newly displayed content into view, requiring the user to scroll manually. Now the expected behavior of each screen scrolls into view automatically. 

* **Readable Timestamps:** Previously, users would open reminder notifications and the timestamp would be listed as: 2026-11-16 at 19:03 · America/New_York. Now users read a cleaner timestamp such as November 11, 2026 7:03 pm. Additionally, we have removed the seconds placeholder when allotting time slots for reminders and tasks. This makes it more efficient for students to complete an action that requires setting the time. 

* **Repetitive Friends Card:**  The new browser navigation update introduced duplicate repeating Friend cards in the user’s dashboard. This has been patched. 

* **Menu Bar:** Previously, the menu bar was lacking in style. The bar wrapped onto two rows, the ordering felt random, each button had equal sizing and prominence. The sign out button felt isolated. Now the menu bar separates screens within categories, and the notifications bell and profile button take a small portion of the menu.

## Future Hardening of Features to Increase Usability and Trust

* **Private Profile:** Previously, users were only allowed to toggle off public visibility of certain profile features such as profile picture, interests, residence status, year of study, and direct messaging. However, users should be able to remain completely hidden from classmates if they would like to use the app for utility purposes only.

* **Block Feature:** Previously, users were not able to block other users. If a student would like to prevent another user from communicating with them, they should have the ability to block that student.

* **Leave Group Chat:** Previously, users had no way to leave a group chat. Users should have the choice to remove themselves from one.

* **Campus Map Form:** Previously, students could not submit new locations that might contribute to the campus map.

* **Course-level Membership Weakness:** Previously, our application accepted verified, pending, and rejected enrollments. For new classmate-based DM authorization, a rejected enrollment should never establish a trusted classmate relationship.

* **Course Evaluations Lack Courses:** Even though our imported catalog of SBU courses include different classes, the course evaluation search mechanism does not allow you to observe those other existing courses.





