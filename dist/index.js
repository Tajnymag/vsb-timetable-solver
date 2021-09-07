#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.overlaps = exports.slotToTime = exports.TimetableEventType = void 0;
const fs_1 = require("fs");
const js_combinatorics_1 = require("js-combinatorics");
const puppeteer_1 = __importDefault(require("puppeteer"));
const yargs_1 = __importDefault(require("yargs/yargs"));
const helpers_1 = require("yargs/helpers");
var TimetableEventType;
(function (TimetableEventType) {
    TimetableEventType[TimetableEventType["LECTURE"] = 0] = "LECTURE";
    TimetableEventType[TimetableEventType["PRACTICE"] = 1] = "PRACTICE";
})(TimetableEventType = exports.TimetableEventType || (exports.TimetableEventType = {}));
const scheduleWindows = [
    { beginTime: "07:15:00", endTime: "08:00:00", id: 1, order: 0 },
    { beginTime: "08:00:00", endTime: "08:45:00", id: 2, order: 1 },
    { beginTime: "09:00:00", endTime: "09:45:00", id: 3, order: 2 },
    { beginTime: "09:45:00", endTime: "10:30:00", id: 4, order: 3 },
    { beginTime: "10:45:00", endTime: "11:30:00", id: 5, order: 4 },
    { beginTime: "11:30:00", endTime: "12:15:00", id: 6, order: 5 },
    { beginTime: "12:30:00", endTime: "13:15:00", id: 7, order: 6 },
    { beginTime: "13:15:00", endTime: "14:00:00", id: 8, order: 7 },
    { beginTime: "14:15:00", endTime: "15:00:00", id: 9, order: 8 },
    { beginTime: "15:00:00", endTime: "15:45:00", id: 10, order: 9 },
    { beginTime: "16:00:00", endTime: "16:45:00", id: 11, order: 10 },
    { beginTime: "16:45:00", endTime: "17:30:00", id: 12, order: 11 },
    { beginTime: "17:45:00", endTime: "18:30:00", id: 13, order: 12 },
    { beginTime: "18:30:00", endTime: "19:15:00", id: 14, order: 13 },
];
function slotToTime(fromSlot, toSlot) {
    const beginTime = scheduleWindows[fromSlot].beginTime;
    const endTime = scheduleWindows[toSlot].endTime;
    return [beginTime, endTime];
}
exports.slotToTime = slotToTime;
function overlaps(eventA, eventB) {
    return eventA.day === eventB.day && eventA.beginSlot <= eventB.endSlot && eventB.beginSlot <= eventA.endSlot;
}
exports.overlaps = overlaps;
(async () => {
    const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
        .options({
        username: {
            type: 'string',
            demandOption: true,
            description: 'Your VŠB SSO username'
        },
        password: {
            type: 'string',
            demandOption: true,
            description: 'Your VŠB SSO password'
        },
        verbose: {
            type: 'boolean',
            default: false,
            description: 'Print progress info'
        },
        output: {
            alias: 'o',
            type: 'string',
            description: 'Filename to store a JSON file with possible timetable combinations'
        },
        stdout: {
            type: 'boolean',
            default: false,
            description: 'Print the possibilities to the stdout as JSON'
        },
        hideDay: {
            type: 'array',
            default: [],
            description: 'A list of day indexes (0-4) in which to not take any classes'
        },
        hideTeacher: {
            type: 'string',
            description: 'Regex of a teacher name to be skipped when selecting a class'
        },
        minHour: {
            type: 'number',
            description: 'An (integer) hour before which to not take any classes'
        },
        maxHour: {
            type: 'number',
            description: 'An (integer) hour after which to not take any classes'
        }
    }).parseSync();
    if (!argv.stdout && !argv.output) {
        console.error('At least one of the --stdout and --output flags has to be set!');
        process.exit(1);
    }
    const browser = await puppeteer_1.default.launch({
        headless: true
    });
    const page = await browser.newPage();
    argv.verbose && console.log('Logging in...');
    await page.goto('https://edison.sso.vsb.cz/wps/myportal/student', { waitUntil: "networkidle2" });
    await page.type('#username', argv.username);
    await page.type('#password', argv.password);
    await Promise.all([page.click('input[name="submit"]'), page.waitForNavigation({ waitUntil: "load" })]);
    argv.verbose && console.log('Logged in');
    await page.goto('https://edison.sso.vsb.cz/wps/myportal/student/rozvrh/volba-rozvrhu', { waitUntil: 'networkidle0' });
    argv.verbose && console.log('Got to volba-rozvrhu');
    const timetableContainer = await page.$('.dataTable.evenOdd.specialGray');
    if (!timetableContainer) {
        throw new Error('Could not find the timetable container table!');
    }
    await timetableContainer.evaluate(el => el.style.display = 'inherit');
    argv.verbose && console.log('Set datatable to be visible');
    const timetableOpenBtns = await page.$$('.wpthemeControlBody > div a[title="Zvolit"]:not([href="#"])');
    argv.verbose && console.log('Found timetable-open buttons');
    const timetableEvents = [];
    for (const timetableOpenBtn of timetableOpenBtns) {
        await timetableOpenBtn.click();
        argv.verbose && console.log('Opened a timetable');
        await page.waitForSelector('.wpthemeControlBody .schedTable');
        await page.waitForTimeout(1000);
        const schedTable = await page.$('.wpthemeControlBody .schedTable');
        if (!schedTable) {
            throw new Error('Could not find the schedule table!');
        }
        const subject = await schedTable.evaluate(el => el.parentElement?.parentElement?.querySelector('h3')?.innerText || 'FAILED_TO_SCRAPE');
        const eventEls = await schedTable.$$('.actTable');
        for (const eventEl of eventEls) {
            const content = await eventEl.evaluate(el => el.innerText);
            const [firstLine, secondLine, thirdLine] = content.split('\n').map(s => s.trim());
            const [pickedUsers, maxUsers] = firstLine.split(' / ');
            const full = pickedUsers === maxUsers;
            const teacher = secondLine;
            const [room, eventId] = thirdLine.split('\t');
            const type = await eventEl.evaluate(el => el.classList.contains('schedLecture'))
                ? TimetableEventType.LECTURE
                : TimetableEventType.PRACTICE;
            const picked = await eventEl.evaluate(el => el.classList.contains('picked'));
            const day = await eventEl.evaluate(el => el?.parentElement?.parentElement?.rowIndex / 2 - 1);
            const beginSlot = await eventEl.evaluate(el => {
                const prevAll = (element) => {
                    let result = [];
                    // @ts-ignore
                    while (element = element.previousElementSibling)
                        result.push(element);
                    return result;
                };
                let offset = prevAll(el?.parentElement).reduce((acc, curr) => {
                    let colSpan = curr.colSpan || 1;
                    return acc + colSpan;
                }, 0);
                return offset - 1;
            });
            const endSlot = await eventEl.evaluate((el, beginSlot) => {
                const columnEl = el.parentElement;
                return beginSlot + (columnEl.colSpan - 1);
            }, beginSlot);
            const [beginTime, endTime] = slotToTime(beginSlot, endSlot);
            timetableEvents.push({
                subject,
                eventId,
                teacher,
                room,
                type,
                full,
                picked,
                day,
                beginSlot,
                endSlot,
                beginTime,
                endTime
            });
        }
    }
    const eventsSortedMap = new Map();
    const filteredEvents = timetableEvents.filter(event => {
        if (event.full && !event.picked) {
            return false;
        }
        if (argv.hideDay.map(Number.parseInt).includes(event.day)) {
            return false;
        }
        if (argv.hideTeacher && new RegExp(argv.hideTeacher).test(event.teacher)) {
            return false;
        }
        if (argv.minHour) {
            const [hour, minute, second] = event.beginTime.split(':');
            if (Number.parseInt(hour) < argv.minHour) {
                return false;
            }
        }
        if (argv.maxHour) {
            const [hour, minute, second] = event.endTime.split(':');
            if (Number.parseInt(hour) > argv.maxHour) {
                return false;
            }
        }
        return true;
    });
    for (const event of filteredEvents) {
        if (!eventsSortedMap.has(event.subject)) {
            eventsSortedMap.set(event.subject, { lectures: [], practices: [] });
        }
        const lastState = eventsSortedMap.get(event.subject);
        if (!lastState)
            continue;
        if (event.type === TimetableEventType.LECTURE) {
            lastState.lectures.push(event);
        }
        else {
            lastState.practices.push(event);
        }
        eventsSortedMap.set(event.subject, lastState);
    }
    const combinationSequence = [...eventsSortedMap.values()].map(e => [e.lectures, e.practices]).flat(1);
    const cartesianProduct = new js_combinatorics_1.CartesianProduct(...combinationSequence);
    argv.verbose && console.log(`Found ${cartesianProduct.length} combinations`);
    const possibilities = [];
    for (const possibility of cartesianProduct) {
        const combinations = new js_combinatorics_1.Combination(possibility, 2);
        let overlapFound = false;
        for (const pair of combinations) {
            const [a, b] = pair;
            if (overlaps(a, b)) {
                overlapFound = true;
                break;
            }
        }
        if (overlapFound)
            continue;
        possibilities.push(possibility);
    }
    const cleanedUpPossibilities = possibilities.map(p => p.map(event => ({
        subject: event.subject,
        eventId: event.eventId,
        teacher: event.teacher,
        room: event.room,
        type: event.type === TimetableEventType.LECTURE ? 'lecture' : 'practice',
        day: event.day,
        beginTime: event.beginTime,
        endTime: event.endTime,
        beginSlot: event.beginSlot,
        endSlot: event.endSlot
    })));
    if (argv.output) {
        (0, fs_1.writeFileSync)('possibilities.json', JSON.stringify(cleanedUpPossibilities));
    }
    if (argv.stdout) {
        console.dir(cleanedUpPossibilities);
    }
    await browser.close();
})().catch(err => {
    console.error(err);
    process.exit(1);
});
