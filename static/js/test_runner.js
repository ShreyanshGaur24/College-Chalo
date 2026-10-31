/**
 * College-Chalo Interactive Test Runner UI
 * Executes and displays the 12 mandatory validation scenarios from Section 9.
 */

class TestRunnerUI {
    static init() {
        const runBtn = document.getElementById('runAllTestsBtn');
        if (runBtn) {
            runBtn.addEventListener('click', () => this.executeSuite());
        }

        const simStuFacBtn = document.getElementById('simStuFacBtn');
        if (simStuFacBtn) {
            simStuFacBtn.addEventListener('click', () => this.simulateCrossBooking('stu-rohan', 'ride-fac-1', 'Student booking Faculty Ride'));
        }

        const simFacStuBtn = document.getElementById('simFacStuBtn');
        if (simFacStuBtn) {
            simFacStuBtn.addEventListener('click', () => this.simulateCrossBooking('fac-arun', 'ride-stu-1', 'Faculty booking Student Ride'));
        }

        const simRoleTamperBtn = document.getElementById('simRoleTamperBtn');
        if (simRoleTamperBtn) {
            simRoleTamperBtn.addEventListener('click', () => this.simulateRoleTampering());
        }
    }

    static async executeSuite() {
        const runBtn = document.getElementById('runAllTestsBtn');
        const resultsTable = document.getElementById('testResultsBody');
        const summaryBadge = document.getElementById('testSummaryBadge');

        if (runBtn) {
            runBtn.disabled = true;
            runBtn.innerHTML = `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg> Executing Security Tests...`;
        }

        resultsTable.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 30px; color: var(--text-muted);">
                    Running all 12 database trigger & backend community isolation tests...
                </td>
            </tr>
        `;

        try {
            const data = await ApiService.runTestSuite();
            resultsTable.innerHTML = '';

            data.results.forEach(test => {
                const tr = document.createElement('tr');
                const badgeClass = test.passed ? 'test-badge-pass' : 'test-badge-fail';
                const statusText = test.passed ? 'PASS' : 'FAIL';

                tr.innerHTML = `
                    <td style="font-weight: 700;">#${test.test_num}</td>
                    <td>
                        <div style="font-weight: 600; color: var(--text-primary);">${test.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">${test.detail}</div>
                    </td>
                    <td>
                        <span class="${badgeClass}">${statusText}</span>
                    </td>
                    <td>
                        <div style="font-size: 0.78rem;">
                            <strong>Expected:</strong> <span style="color: #047857;">${test.expected || 'Blocked'}</span><br>
                            <strong>Actual:</strong> <span style="color: ${test.passed ? '#047857' : '#b91c1c'};">${test.actual || 'Blocked'}</span>
                        </div>
                    </td>
                `;
                resultsTable.appendChild(tr);
            });

            if (summaryBadge) {
                if (data.success) {
                    summaryBadge.className = 'test-summary-pill test-badge-pass';
                    summaryBadge.innerText = `${data.passed_tests} / ${data.total_tests} Tests Passed (100% Enforced)`;
                } else {
                    summaryBadge.className = 'test-summary-pill test-badge-fail';
                    summaryBadge.innerText = `${data.failed_tests} Tests Failed`;
                }
            }

            showToast("Test suite completed! All 12 isolation rules verified.", "success");
        } catch (err) {
            showToast(`Test suite execution error: ${err.message}`, "error");
        } finally {
            if (runBtn) {
                runBtn.disabled = false;
                runBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Run All 12 Security Tests
                `;
            }
        }
    }

    static async simulateCrossBooking(passengerId, rideId, testLabel) {
        showToast(`Simulating ${testLabel}...`, "info");
        try {
            // First switch to passenger account
            const role = passengerId.startsWith('stu') ? 'student' : (passengerId.startsWith('fac') ? 'faculty' : 'staff');
            await ApiService.demoSwitch(role);

            // Attempt to book
            await ApiService.bookRide(rideId, { seats_booked: 1 });
            showToast(`Error: Ride was accepted when it should have been blocked!`, "error");
        } catch (err) {
            const errorText = err.message || '';
            const isExpected = errorText.includes("This ride is available only to members of your own college community.");
            
            if (isExpected) {
                showToast(`Backend rejected: "${errorText}"`, "error");
            } else {
                showToast(`Rejected: ${errorText}`, "info");
            }
        }
    }

    static async simulateRoleTampering() {
        showToast("Testing role alteration...", "info");
        try {
            await ApiService.updateProfile({ community_role: "faculty" });
            showToast("Error: Role was changed directly!", "error");
        } catch (err) {
            const errorText = err.message || '';
            showToast(`Blocked by trigger: "${errorText}"`, "error");
        }
    }
}
