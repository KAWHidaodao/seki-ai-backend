// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";

/// @title SekiPredictCore
/// @notice Generic N-outcome parimutuel prediction market settled in SEKI.
/// @dev Supports Binary (N=2), Ternary (N=3), Race (N>=2, up to 16).
///      - Anyone can create a market.
///      - Any bet amount allowed.
///      - Min 4 unique bettors to count; otherwise VOID -> refund all.
///      - Keeper (owner) proposes outcome; 24h dispute window.
///      - During dispute window, owner can cancel market -> VOID -> refund all.
///      - After window expires with no cancel, outcome is final, winners claim pro-rata.
///      - No house cut. Ties/void = full refund.
contract SekiPredictCore is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Open, Proposed, Cancelled, Resolved }

    struct Market {
        address creator;
        uint8   optionCount;       // 2..16
        uint8   winningOption;     // 1-based; 0 = none
        Status  status;
        uint64  openUntil;         // betting closes at this timestamp
        uint64  proposedAt;        // when keeper proposed outcome
        uint64  disputeWindow;     // seconds
        uint256 totalPool;
        string  question;
        // per-option totals
        mapping(uint8 => uint256) optionTotal;
        // per-user per-option stake
        mapping(address => mapping(uint8 => uint256)) stake;
        // unique bettor tracking
        mapping(address => bool) hasBet;
        uint256 uniqueBettors;
        // claim tracking
        mapping(address => bool) claimed;
    }

    IERC20 public immutable seki;
    uint256 public marketCount;
    mapping(uint256 => Market) private markets;

    uint64 public constant DEFAULT_DISPUTE_WINDOW = 24 hours;
    uint64 public constant MIN_DURATION = 15 minutes;
    uint64 public constant MAX_DURATION = 7 days;
    uint256 public constant MIN_UNIQUE_BETTORS = 4;

    event MarketCreated(
        uint256 indexed id,
        address indexed creator,
        uint8 optionCount,
        uint64 openUntil,
        string question
    );
    event BetPlaced(uint256 indexed id, address indexed user, uint8 option, uint256 amount);
    event OutcomeProposed(uint256 indexed id, uint8 winningOption, uint64 proposedAt);
    event MarketResolved(uint256 indexed id, uint8 winningOption);
    event MarketCancelled(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);

    constructor(address _seki) Ownable(msg.sender) {
        require(_seki != address(0), "seki=0");
        seki = IERC20(_seki);
    }

    // ---------------- Market lifecycle ----------------

    function createMarket(
        string calldata question,
        uint8 optionCount,
        uint64 duration
    ) external returns (uint256 id) {
        require(optionCount >= 2 && optionCount <= 16, "optionCount");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "duration");
        id = ++marketCount;
        Market storage m = markets[id];
        m.creator = msg.sender;
        m.optionCount = optionCount;
        m.status = Status.Open;
        m.openUntil = uint64(block.timestamp) + duration;
        m.disputeWindow = DEFAULT_DISPUTE_WINDOW;
        m.question = question;
        emit MarketCreated(id, msg.sender, optionCount, m.openUntil, question);
    }

    function bet(uint256 id, uint8 option, uint256 amount) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "not open");
        require(block.timestamp < m.openUntil, "closed");
        require(option >= 1 && option <= m.optionCount, "option");
        require(amount > 0, "amount=0");

        seki.safeTransferFrom(msg.sender, address(this), amount);

        if (!m.hasBet[msg.sender]) {
            m.hasBet[msg.sender] = true;
            m.uniqueBettors += 1;
        }
        m.stake[msg.sender][option] += amount;
        m.optionTotal[option] += amount;
        m.totalPool += amount;

        emit BetPlaced(id, msg.sender, option, amount);
    }

    /// @notice Keeper (owner) proposes an outcome after betting closes.
    ///         winningOption = 0 means VOID (will refund).
    function proposeOutcome(uint256 id, uint8 winningOption) external onlyOwner {
        Market storage m = markets[id];
        require(m.status == Status.Open, "bad state");
        require(block.timestamp >= m.openUntil, "still open");
        require(winningOption <= m.optionCount, "option");
        m.status = Status.Proposed;
        m.winningOption = winningOption;
        m.proposedAt = uint64(block.timestamp);
        emit OutcomeProposed(id, winningOption, m.proposedAt);
    }

    /// @notice Owner cancels during dispute window -> full refund.
    function cancelMarket(uint256 id) external onlyOwner {
        Market storage m = markets[id];
        require(
            m.status == Status.Open ||
            (m.status == Status.Proposed && block.timestamp < m.proposedAt + m.disputeWindow),
            "cannot cancel"
        );
        m.status = Status.Cancelled;
        emit MarketCancelled(id);
    }

    /// @notice Finalize a proposed outcome after the dispute window.
    function finalize(uint256 id) external {
        Market storage m = markets[id];
        require(m.status == Status.Proposed, "not proposed");
        require(block.timestamp >= m.proposedAt + m.disputeWindow, "dispute open");
        m.status = Status.Resolved;
        emit MarketResolved(id, m.winningOption);
    }

    // ---------------- Claim ----------------

    function claim(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        require(!m.claimed[msg.sender], "claimed");
        uint256 payout = _previewClaim(m, msg.sender);
        require(payout > 0, "nothing");
        m.claimed[msg.sender] = true;
        seki.safeTransfer(msg.sender, payout);
        emit Claimed(id, msg.sender, payout);
    }

    function previewClaim(uint256 id, address user) external view returns (uint256) {
        return _previewClaim(markets[id], user);
    }

    function _previewClaim(Market storage m, address user) internal view returns (uint256) {
        if (m.claimed[user]) return 0;

        // Refund cases: cancelled OR resolved-but-void OR resolved with too few bettors OR winner pool empty
        bool refund;
        if (m.status == Status.Cancelled) {
            refund = true;
        } else if (m.status == Status.Resolved) {
            if (m.winningOption == 0) refund = true;
            else if (m.uniqueBettors < MIN_UNIQUE_BETTORS) refund = true;
            else if (m.optionTotal[m.winningOption] == 0) refund = true;
        } else {
            return 0; // not settleable yet
        }

        if (refund) {
            // sum user stake across all options
            uint256 total;
            for (uint8 i = 1; i <= m.optionCount; i++) {
                total += m.stake[user][i];
            }
            return total;
        }

        // pro-rata winner payout
        uint256 userWin = m.stake[user][m.winningOption];
        if (userWin == 0) return 0;
        return (userWin * m.totalPool) / m.optionTotal[m.winningOption];
    }

    // ---------------- Views ----------------

    function getMarket(uint256 id) external view returns (
        address creator,
        uint8 optionCount,
        uint8 winningOption,
        Status status,
        uint64 openUntil,
        uint64 proposedAt,
        uint64 disputeWindow,
        uint256 totalPool,
        uint256 uniqueBettors,
        string memory question
    ) {
        Market storage m = markets[id];
        return (
            m.creator,
            m.optionCount,
            m.winningOption,
            m.status,
            m.openUntil,
            m.proposedAt,
            m.disputeWindow,
            m.totalPool,
            m.uniqueBettors,
            m.question
        );
    }

    function optionTotal(uint256 id, uint8 option) external view returns (uint256) {
        return markets[id].optionTotal[option];
    }

    function userStake(uint256 id, address user, uint8 option) external view returns (uint256) {
        return markets[id].stake[user][option];
    }

    function hasClaimed(uint256 id, address user) external view returns (bool) {
        return markets[id].claimed[user];
    }
}
