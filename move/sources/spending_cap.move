/// Autonomous payment agent: capability-based spending allowance for Sui.
///
/// Design: the owner deposits funds into a `SpendingCap<T>` (an escrow of
/// `Balance<T>`) and shares it on-chain. The cap records which `agent`
/// address is allowed to trigger payments, how much may be spent in total,
/// to which single recipient, and until when. The agent never receives the
/// owner's private key or coin objects directly — it only ever gets to call
/// `execute_payment`, which is gated by the checks below. The owner can
/// revoke the cap at any time, which zeroes its allowance and returns any
/// remaining escrowed funds.
module sui_agent_pay::spending_cap {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;

    /// Caller is not the address recorded as `owner` on the cap.
    const ENotOwner: u64 = 0;
    /// Caller is not the address recorded as `agent` on the cap.
    const ENotAgent: u64 = 1;
    /// The cap has already been revoked or otherwise deactivated.
    const ECapInactive: u64 = 2;
    /// Current time (ms) is at or past `expiry`.
    const ECapExpired: u64 = 3;
    /// Payment would push `spent` past `max_amount`.
    const ELimitExceeded: u64 = 4;
    /// `recipient` passed to `execute_payment` does not match `allowed_recipient`.
    const EWrongRecipient: u64 = 5;
    /// The escrowed balance does not have enough funds for this payment.
    const EInsufficientEscrow: u64 = 6;
    /// `max_amount` was set to zero, which can never permit spending.
    const EZeroMaxAmount: u64 = 7;
    /// `owner` and `agent` must be different addresses.
    const ESameOwnerAgent: u64 = 8;

    /// A revocable, escrow-backed spending allowance for one agent.
    ///
    /// `T` is the coin type held in escrow (e.g. `sui::sui::SUI` or a USDC
    /// coin type). The object is shared so the `agent` address can invoke
    /// `execute_payment` on it without ever owning it or holding the
    /// owner's keys.
    public struct SpendingCap<phantom T> has key {
        id: UID,
        owner: address,
        agent: address,
        max_amount: u64,
        spent: u64,
        allowed_recipient: address,
        expiry: u64,
        escrow: Balance<T>,
        active: bool,
    }

    public struct CapCreated has copy, drop {
        cap_id: address,
        owner: address,
        agent: address,
        max_amount: u64,
        allowed_recipient: address,
        expiry: u64,
    }

    public struct PaymentExecuted has copy, drop {
        cap_id: address,
        agent: address,
        recipient: address,
        amount: u64,
        spent_total: u64,
    }

    public struct CapRevoked has copy, drop {
        cap_id: address,
        owner: address,
        refunded_amount: u64,
    }

    /// Create a new spending cap and immediately share it so the named
    /// `agent` can call `execute_payment` on it. `deposit` is moved into
    /// escrow and is the only balance the agent can ever draw from.
    public fun create_spending_cap<T>(
        deposit: Coin<T>,
        agent: address,
        max_amount: u64,
        allowed_recipient: address,
        expiry: u64,
        ctx: &mut TxContext,
    ) {
        let owner = ctx.sender();
        assert!(owner != agent, ESameOwnerAgent);
        assert!(max_amount > 0, EZeroMaxAmount);

        let cap = SpendingCap<T> {
            id: object::new(ctx),
            owner,
            agent,
            max_amount,
            spent: 0,
            allowed_recipient,
            expiry,
            escrow: coin::into_balance(deposit),
            active: true,
        };

        event::emit(CapCreated {
            cap_id: object::uid_to_address(&cap.id),
            owner,
            agent,
            max_amount,
            allowed_recipient,
            expiry,
        });

        transfer::share_object(cap);
    }

    /// Called by the agent to execute a single payment against the cap.
    /// Aborts if the cap is inactive, expired, the recipient does not match,
    /// the amount would exceed the remaining allowance, or escrow is short.
    public fun execute_payment<T>(
        cap: &mut SpendingCap<T>,
        recipient: address,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == cap.agent, ENotAgent);
        assert!(cap.active, ECapInactive);
        assert!(clock.timestamp_ms() < cap.expiry, ECapExpired);
        assert!(recipient == cap.allowed_recipient, EWrongRecipient);

        // spent + amount cannot overflow max_amount (u64 checked add).
        let new_spent = cap.spent + amount;
        assert!(new_spent <= cap.max_amount, ELimitExceeded);
        assert!(balance::value(&cap.escrow) >= amount, EInsufficientEscrow);

        cap.spent = new_spent;
        let payout = coin::take(&mut cap.escrow, amount, ctx);
        transfer::public_transfer(payout, recipient);

        event::emit(PaymentExecuted {
            cap_id: object::uid_to_address(&cap.id),
            agent: cap.agent,
            recipient,
            amount,
            spent_total: cap.spent,
        });
    }

    /// Called by the owner to immediately invalidate the cap and reclaim
    /// any remaining escrowed funds. After this, `execute_payment` always
    /// aborts with `ECapInactive`.
    public fun revoke_cap<T>(cap: &mut SpendingCap<T>, ctx: &mut TxContext) {
        assert!(ctx.sender() == cap.owner, ENotOwner);
        assert!(cap.active, ECapInactive);

        cap.active = false;
        let refund_amount = balance::value(&cap.escrow);
        if (refund_amount > 0) {
            let refund = coin::take(&mut cap.escrow, refund_amount, ctx);
            transfer::public_transfer(refund, cap.owner);
        };

        event::emit(CapRevoked {
            cap_id: object::uid_to_address(&cap.id),
            owner: cap.owner,
            refunded_amount: refund_amount,
        });
    }

    /// Owner can top up the escrow behind an existing, still-active cap.
    public fun top_up<T>(cap: &mut SpendingCap<T>, deposit: Coin<T>, ctx: &mut TxContext) {
        assert!(ctx.sender() == cap.owner, ENotOwner);
        assert!(cap.active, ECapInactive);
        coin::put(&mut cap.escrow, deposit);
    }

    // ----- Read-only accessors (useful for frontend/agent off-chain calls) -----

    public fun owner<T>(cap: &SpendingCap<T>): address { cap.owner }
    public fun agent<T>(cap: &SpendingCap<T>): address { cap.agent }
    public fun max_amount<T>(cap: &SpendingCap<T>): u64 { cap.max_amount }
    public fun spent<T>(cap: &SpendingCap<T>): u64 { cap.spent }
    public fun remaining<T>(cap: &SpendingCap<T>): u64 { cap.max_amount - cap.spent }
    public fun allowed_recipient<T>(cap: &SpendingCap<T>): address { cap.allowed_recipient }
    public fun expiry<T>(cap: &SpendingCap<T>): u64 { cap.expiry }
    public fun escrow_value<T>(cap: &SpendingCap<T>): u64 { balance::value(&cap.escrow) }
    public fun is_active<T>(cap: &SpendingCap<T>): bool { cap.active }
}
