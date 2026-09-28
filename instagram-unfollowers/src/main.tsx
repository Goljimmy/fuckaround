import React, { ChangeEvent, useEffect, useState } from "react";
import { render } from "react-dom";
import "./styles.scss";

import { UserNode } from "./model/user";
import { Toast } from "./components/Toast";
import { UserCheckIcon } from "./components/icons/UserCheckIcon";
import { UserUncheckIcon } from "./components/icons/UserUncheckIcon";
import {
  DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
  DEFAULT_TIME_BETWEEN_UNFOLLOWS,
  DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
  DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
  DEFAULT_USERS_PER_SEARCH_CYCLE,
  FOLLOWERS_PAGE_SAFETY_LIMIT,
  FOLLOWING_PAGE_SAFETY_LIMIT,
  INSTAGRAM_HOSTNAME,
} from "./constants/constants";
import {
  assertUnreachable,
  fetchFriendshipsPage,
  FriendshipsListKind,
  getCookie,
  getCurrentPageUnfollowers,
  getUsersForDisplay,
  RawFriendshipUser,
  rawFriendshipUserToUserNode,
  sleep,
  unfollowUserUrlGenerator,
} from "./utils/utils";
import { NotSearching } from "./components/NotSearching";
import { State } from "./model/state";
import { Searching } from "./components/Searching";
import { Toolbar } from "./components/Toolbar";
import { Unfollowing } from "./components/Unfollowing";
import { Timings } from "./model/timings";
import { loadTimings, loadWhitelist, saveTimings, saveWhitelist } from "./utils/whitelist-manager";

// pause
let scanningPaused = false;

function pauseScan() {
  scanningPaused = !scanningPaused;
}


function App() {
  const [state, setState] = useState<State>({
    status: "initial",
  });

  const [toast, setToast] = useState<{ readonly show: false } | { readonly show: true; readonly text: string }>({
    show: false,
  });

  const [timings, setTimings] = useState<Timings>(() => {
    const storedTimings = loadTimings();
    return {
      timeBetweenSearchCycles: storedTimings?.timeBetweenSearchCycles ?? DEFAULT_TIME_BETWEEN_SEARCH_CYCLES,
      timeToWaitAfterFiveSearchCycles: storedTimings?.timeToWaitAfterFiveSearchCycles ?? DEFAULT_TIME_TO_WAIT_AFTER_FIVE_SEARCH_CYCLES,
      timeBetweenUnfollows: storedTimings?.timeBetweenUnfollows ?? DEFAULT_TIME_BETWEEN_UNFOLLOWS,
      timeToWaitAfterFiveUnfollows: storedTimings?.timeToWaitAfterFiveUnfollows ?? DEFAULT_TIME_TO_WAIT_AFTER_FIVE_UNFOLLOWS,
      usersPerSearchCycle: storedTimings?.usersPerSearchCycle ?? DEFAULT_USERS_PER_SEARCH_CYCLE,
    };
  });

  // Save timings whenever they change
  useEffect(() => {
    saveTimings(timings);
  }, [timings]);


  let isActiveProcess: boolean;
  switch (state.status) {
    case "initial":
      isActiveProcess = false;
      break;
    case "scanning":
    case "unfollowing":
      isActiveProcess = state.percentage < 100;
      break;
    default:
      assertUnreachable(state);
  }

  const onScan = async () => {
    if (state.status !== "initial") {
      return;
    }
    const whitelistedResults = loadWhitelist();
    setState({
      status: "scanning",
      page: 1,
      searchTerm: "",
      currentTab: "non_whitelisted",
      percentage: 0,
      results: [],
      selectedResults: [],
      whitelistedResults,
      filter: {
        showNonFollowers: true,
        showFollowers: false,
        showVerified: true,
        showPrivate: true,
        showWithOutProfilePicture: true,
      },
    });
  };

  const handleScanFilter = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "scanning") {
      return;
    }
    if (state.selectedResults.length > 0) {
      if (!confirm("Changing filter options will clear selected users")) {
        // Force re-render. Bit of a hack but had an issue where the checkbox state was still
        // changing in the UI even even when not confirming. So updating the state fixes this
        // by synchronizing the checkboxes with the filter statuses in the state.
        setState({ ...state });
        return;
      }
    }
    setState({
      ...state,
      // Make sure to clear selected results when changing filter options. This is to avoid having
      // users selected in the unfollow queue but not visible in the UI, which would be confusing.
      selectedResults: [],
      filter: {
        ...state.filter,
        [e.currentTarget.name]: e.currentTarget.checked,
      },
    });
  };

  const handleUnfollowFilter = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "unfollowing") {
      return;
    }
    setState({
      ...state,
      filter: {
        ...state.filter,
        [e.currentTarget.name]: e.currentTarget.checked,
      },
    });
  };

  const toggleUser = (newStatus: boolean, user: UserNode) => {
    if (state.status !== "scanning") {
      return;
    }
    if (newStatus) {
      setState({
        ...state,
        selectedResults: [...state.selectedResults, user],
      });
    } else {
      setState({
        ...state,
        selectedResults: state.selectedResults.filter(result => result.id !== user.id),
      });
    }
  };

  const toggleAllUsers = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "scanning") {
      return;
    }
    const displayed = getUsersForDisplay(
      state.results,
      state.whitelistedResults,
      state.currentTab,
      state.searchTerm,
      state.filter,
    );
    if (e.currentTarget.checked) {
      const currentIds = new Set(state.selectedResults.map(u => u.id));
      const toAdd = displayed.filter(u => !currentIds.has(u.id));
      setState({
        ...state,
        selectedResults: [...state.selectedResults, ...toAdd],
      });
    } else {
      const displayedIds = new Set(displayed.map(u => u.id));
      setState({
        ...state,
        selectedResults: state.selectedResults.filter(u => !displayedIds.has(u.id)),
      });
    }
  };

  // it will work the same as toggleAllUsers, but it will select everyone on the current page.
  const toggleCurrentePageUsers = (e: ChangeEvent<HTMLInputElement>) => {
    if (state.status !== "scanning") {
      return;
    }
    const pageUsers = getCurrentPageUnfollowers(
      getUsersForDisplay(
        state.results,
        state.whitelistedResults,
        state.currentTab,
        state.searchTerm,
        state.filter,
      ),
      state.page,
    );
    if (e.currentTarget.checked) {
      const currentIds = new Set(state.selectedResults.map(u => u.id));
      const toAdd = pageUsers.filter(u => !currentIds.has(u.id));
      setState({
        ...state,
        selectedResults: [...state.selectedResults, ...toAdd],
      });
    } else {
      const pageUserIds = new Set(pageUsers.map(u => u.id));
      setState({
        ...state,
        selectedResults: state.selectedResults.filter(u => !pageUserIds.has(u.id)),
      });
    }
  };

  const onWhitelistUpdate = (updatedWhitelist: readonly UserNode[]) => {
    saveWhitelist(updatedWhitelist);
    if (state.status === "scanning") {
      setState({
        ...state,
        whitelistedResults: updatedWhitelist,
      });
    }
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Prompt user if he tries to leave while in the middle of a process (searching / unfollowing / etc..)
      // This is especially good for avoiding accidental tab closing which would result in a frustrating experience.
      if (!isActiveProcess) {
        return;
      }

      // `e` Might be undefined in older browsers, so silence linter for this one.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      e = e || window.event;

      // `e` Might be undefined in older browsers, so silence linter for this one.
      // For IE and Firefox prior to version 4
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (e) {
        e.returnValue = "Changes you made may not be saved.";
      }

      // For Safari
      return "Changes you made may not be saved.";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isActiveProcess, state]);

  useEffect(() => {
    // Instagram's private following/followers endpoints (see
    // utils/utils.ts) don't expose a reliable total count up front the way
    // the old GraphQL endpoint did, so we can't compute an exact
    // percentage. This gives a smooth, ever-increasing estimate within a
    // phase's share of the progress bar without ever overselling 100%
    // before the phase is actually done.
    const estimatePhaseProgress = (usersFetchedSoFar: number): number =>
      100 * (1 - 1 / (1 + usersFetchedSoFar / 150));

    // Fetches every page of `kind` (following or followers), applying the
    // same pacing/pause/backoff behavior the original single-endpoint scan
    // used, and reports progress within [progressRangeStart, progressRangeEnd]
    // of the overall percentage bar.
    const fetchList = async (
      kind: FriendshipsListKind,
      pageSafetyLimit: number,
      progressRangeStart: number,
      progressRangeEnd: number,
      onPageUsers: (pageUsers: readonly RawFriendshipUser[]) => void,
    ): Promise<boolean> => {
      let maxId: string | undefined;
      let pagesFetched = 0;
      let scrollCycle = 0;
      let totalUsersFetched = 0;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        let page;
        try {
          page = await fetchFriendshipsPage(kind, maxId, timings.usersPerSearchCycle);
        } catch (e) {
          console.error(`Stopping ${kind} scan early:`, e);
          return false;
        }

        const pageUsers = page.users ?? [];
        totalUsersFetched += pageUsers.length;
        onPageUsers(pageUsers);

        setState(prevState => {
          if (prevState.status !== "scanning") {
            return prevState;
          }
          const rangeSize = progressRangeEnd - progressRangeStart;
          return {
            ...prevState,
            percentage: Math.round(progressRangeStart + estimatePhaseProgress(totalUsersFetched) * (rangeSize / 100)),
          };
        });

        const hasMore = Boolean(page.next_max_id) && page.has_more !== false;
        if (!hasMore || pageUsers.length === 0) {
          break;
        }

        pagesFetched += 1;
        if (pagesFetched >= pageSafetyLimit) {
          console.error(`Stopping ${kind} scan early: hit the safety cap of ${pageSafetyLimit} pages with ${totalUsersFetched} users fetched.`);
          return false;
        }
        maxId = page.next_max_id;

        // Pause scanning if user requested so.
        while (scanningPaused) {
          await sleep(1000);
          console.info("Scan paused");
        }

        // Human-like behavior: Micro-pause between fetching chunks
        const microPause = Math.floor(Math.random() * 1500) + 500; // 500ms - 2000ms
        await sleep(microPause);

        // Standard delay between cycles
        await sleep(Math.floor(Math.random() * (timings.timeBetweenSearchCycles - timings.timeBetweenSearchCycles * 0.7)) + timings.timeBetweenSearchCycles);

        scrollCycle++;
        if (scrollCycle > 6) {
          scrollCycle = 0;
          // Variable long sleep to avoid patterns
          const longSleepVar = Math.max(
            0,
            timings.timeToWaitAfterFiveSearchCycles + (Math.random() * 10000 - 5000), // +/- 5 seconds
          );
          setToast({
            show: true,
            text: `Sleeping ${Math.round(longSleepVar / 1000)} seconds to prevent getting temp blocked`,
          });
          await sleep(longSleepVar);
        }
        setToast({ show: false });
      }

      setState(prevState => {
        if (prevState.status !== "scanning") {
          return prevState;
        }
        return {
          ...prevState,
          percentage: progressRangeEnd,
        };
      });

      return true;
    };

    const scan = async () => {
      if (state.status !== "scanning") {
        return;
      }

      // 1. Fetch all accounts you follow.
      // We push directly into followingUsers to avoid allocating new arrays on every page.
      const followingUsers: RawFriendshipUser[] = [];
      const followingCompleted = await fetchList(
        "following",
        FOLLOWING_PAGE_SAFETY_LIMIT,
        0,
        45,
        pageUsers => {
          followingUsers.push(...pageUsers);
        },
      );

      // If following failed completely on the first attempt, don't waste network requests on followers.
      if (!followingCompleted && followingUsers.length === 0) {
        setToast({
          show: true,
          text: "Scan failed: could not load your following list from Instagram.",
        });
        return;
      }

      // 2. Fetch follower IDs only.
      // We only store IDs in a Set<string> and discard the rest of the follower objects
      // immediately to minimize memory usage.
      const followerIds = new Set<string>();
      const followersCompleted = await fetchList(
        "followers",
        FOLLOWERS_PAGE_SAFETY_LIMIT,
        45,
        95,
        pageUsers => {
          for (const user of pageUsers) {
            followerIds.add(String(user.pk_id ?? user.pk));
          }
        },
      );

      const allCompleted = followingCompleted && followersCompleted;

      const results: UserNode[] = followingUsers.map(user =>
        rawFriendshipUserToUserNode(user, followerIds.has(String(user.pk_id ?? user.pk))),
      );

      setState(prevState => {
        if (prevState.status !== "scanning") {
          return prevState;
        }
        return {
          ...prevState,
          percentage: allCompleted ? 100 : prevState.percentage,
          results,
        };
      });

      let toastMessage = "Scanning completed!";
      if (!followingCompleted && !followersCompleted) {
        toastMessage = `Partial scan: loaded ${followingUsers.length} accounts, but scan was interrupted.`;
      } else if (!followersCompleted) {
        toastMessage = "Warning: Followers list was interrupted. Accounts that follow you may appear as non-followers.";
      } else if (!followingCompleted) {
        toastMessage = `Partial scan: loaded ${followingUsers.length} followed accounts before scan stopped.`;
      }

      setToast({
        show: true,
        text: toastMessage,
      });
    };
    scan();
    // Dependency array not entirely legit, but works this way. TODO: Find a way to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    const unfollow = async () => {
      if (state.status !== "unfollowing") {
        return;
      }

      // Ends the run early. Marking it 100% ends the "active process" so the user can leave the page.
      const stopUnfollowing = (reason: string) => {
        setState(prevState => {
          if (prevState.status !== "unfollowing") {
            return prevState;
          }
          return {
            ...prevState,
            percentage: 100,
          };
        });
        setToast({
          show: true,
          text: reason,
        });
      };

      const csrftoken = getCookie("csrftoken");
      if (csrftoken === null) {
        stopUnfollowing("Could not find your Instagram login session. Log in to instagram.com, reload the page and try again.");
        return;
      }

      let counter = 0;
      for (const user of state.selectedResults) {
        counter += 1;
        // Fix: Changed from Math.floor to Math.round to ensure progress reaches 100%
        // Math.floor would leave progress at 99% when near completion
        const percentage = Math.round((counter / state.selectedResults.length) * 100);
        let unfollowedSuccessfully = false;
        let failureDetail = "network error";
        try {
          const response = await fetch(unfollowUserUrlGenerator(user.id), {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "x-csrftoken": csrftoken,
            },
            method: "POST",
            mode: "cors",
            credentials: "include",
          });
          // Instagram signals rate limits and action blocks with a non-2xx status and/or a
          // `"status": "fail"` body. Counting those as successes would keep sending unfollows
          // while blocked, which is how a temporary block turns into a longer restriction.
          const body = (await response.json().catch(() => null)) as { readonly status?: string } | null;
          unfollowedSuccessfully = response.ok && body?.status !== "fail";
          failureDetail = `HTTP ${response.status}`;
        } catch (e) {
          console.error(e);
        }
        setState(prevState => {
          if (prevState.status !== "unfollowing") {
            return prevState;
          }
          return {
            ...prevState,
            percentage,
            unfollowLog: [
              ...prevState.unfollowLog,
              {
                user,
                unfollowedSuccessfully,
              },
            ],
          };
        });
        if (!unfollowedSuccessfully) {
          stopUnfollowing(
            `Instagram rejected the unfollow of ${user.username} (${failureDetail}), so the run stopped. ` +
            "You're likely rate-limited: wait for it to clear, then rescan and run again.",
          );
          return;
        }
        // If unfollowing the last user in the list, no reason to wait.
        if (user === state.selectedResults[state.selectedResults.length - 1]) {
          break;
        }
        await sleep(Math.floor(Math.random() * (timings.timeBetweenUnfollows * 1.2 - timings.timeBetweenUnfollows)) + timings.timeBetweenUnfollows);

        if (counter % 5 === 0) {
          setToast({
            show: true,
            text: `Sleeping ${timings.timeToWaitAfterFiveUnfollows / 60000} minutes to prevent getting temp blocked`,
          });
          await sleep(timings.timeToWaitAfterFiveUnfollows);
        }
        setToast({ show: false });
      }
    };
    unfollow();
    // Dependency array not entirely legit, but works this way. TODO: Find a way to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  let markup: React.JSX.Element;
  switch (state.status) {
    case "initial":
      markup = <NotSearching onScan={onScan}></NotSearching>;
      break;

    case "scanning": {
      markup = <Searching
        state={state}
        handleScanFilter={handleScanFilter}
        toggleUser={toggleUser}
        pauseScan={pauseScan}
        setState={setState}
        scanningPaused={scanningPaused}
        UserCheckIcon={UserCheckIcon}
        UserUncheckIcon={UserUncheckIcon}
      ></Searching>;
      break;
    }

    case "unfollowing":
      markup = <Unfollowing
        state={state}
        handleUnfollowFilter={handleUnfollowFilter}
      ></Unfollowing>;
      break;

    default:
      assertUnreachable(state);
  }

  const showScanWarning = state.status === "scanning" && state.results.length === 0;

  return (
    <main id="main" role="main" className={`iu ${showScanWarning ? "has-scan-warning" : ""}`}>
      <section className="overlay">
        <Toolbar
          state={state}
          setState={setState}
          isActiveProcess={isActiveProcess}
          toggleAllUsers={toggleAllUsers}
          toggleCurrentePageUsers={toggleCurrentePageUsers}
          setTimings={setTimings}
          currentTimings={timings}
          whitelistedUsers={state.status === "scanning" ? state.whitelistedResults : loadWhitelist()}
          onWhitelistUpdate={onWhitelistUpdate}
        ></Toolbar>

        {markup}

        {toast.show && <Toast show={toast.show} message={toast.text} onClose={() => setToast({ show: false })} />}
      </section>
    </main>
  );
}

if (location.hostname !== INSTAGRAM_HOSTNAME) {
  alert("Can be used only on Instagram routes");
} else {
  document.title = "InstagramUnfollowers";
  document.body.innerHTML = "";
  render(<App />, document.body);
}
