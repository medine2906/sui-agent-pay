#[test_only]
module sui_agent_pay::spending_cap_tests {
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::clock::{Self};
    use sui::test_scenario::{Self as ts};
    use sui_agent_pay::spending_cap::{Self, SpendingCap};

    const OWNER: address = @0xA11CE;
    const AGENT: address = @0xA9E17;
    const RECIPIENT: address = @0xBEEF;
    const STRANGER: address = @0xDEAD;

    fun setup_cap(scenario: &mut ts::Scenario, max_amount: u64, expiry: u64, deposit_amount: u64) {
        ts::next_tx(scenario, OWNER);
        {
            let ctx = ts::ctx(scenario);
            let deposit = coin::mint_for_testing<SUI>(deposit_amount, ctx);
            spending_cap::create_spending_cap<SUI>(deposit, AGENT, max_amount, RECIPIENT, expiry, ctx);
        };
    }

    #[test]
    fun test_create_and_execute_payment() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            spending_cap::execute_payment<SUI>(&mut cap, RECIPIENT, 40, &clock, ctx);
            assert!(spending_cap::spent(&cap) == 40, 0);
            assert!(spending_cap::remaining(&cap) == 60, 1);
            clock::destroy_for_testing(clock);
            ts::return_shared(cap);
        };

        ts::next_tx(&mut scenario, RECIPIENT);
        {
            let received = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
            assert!(coin::value(&received) == 40, 2);
            ts::return_to_sender(&scenario, received);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = spending_cap::ELimitExceeded)]
    fun test_execute_payment_over_limit_aborts() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            spending_cap::execute_payment<SUI>(&mut cap, RECIPIENT, 101, &clock, ctx);
            clock::destroy_for_testing(clock);
            ts::return_shared(cap);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = spending_cap::ECapExpired)]
    fun test_execute_payment_after_expiry_aborts() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 10, 100);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let mut clock = clock::create_for_testing(ctx);
            clock::set_for_testing(&mut clock, 20);
            spending_cap::execute_payment<SUI>(&mut cap, RECIPIENT, 10, &clock, ctx);
            clock::destroy_for_testing(clock);
            ts::return_shared(cap);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = spending_cap::EWrongRecipient)]
    fun test_execute_payment_wrong_recipient_aborts() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            spending_cap::execute_payment<SUI>(&mut cap, STRANGER, 10, &clock, ctx);
            clock::destroy_for_testing(clock);
            ts::return_shared(cap);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = spending_cap::ENotAgent)]
    fun test_execute_payment_not_agent_aborts() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, STRANGER);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            spending_cap::execute_payment<SUI>(&mut cap, RECIPIENT, 10, &clock, ctx);
            clock::destroy_for_testing(clock);
            ts::return_shared(cap);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_revoke_cap_refunds_owner_and_blocks_future_payments() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            spending_cap::revoke_cap<SUI>(&mut cap, ctx);
            assert!(!spending_cap::is_active(&cap), 0);
            ts::return_shared(cap);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let refunded = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
            assert!(coin::value(&refunded) == 100, 1);
            ts::return_to_sender(&scenario, refunded);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = spending_cap::ECapInactive)]
    fun test_execute_payment_after_revoke_aborts() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            spending_cap::revoke_cap<SUI>(&mut cap, ctx);
            ts::return_shared(cap);
        };

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let clock = clock::create_for_testing(ctx);
            spending_cap::execute_payment<SUI>(&mut cap, RECIPIENT, 1, &clock, ctx);
            clock::destroy_for_testing(clock);
            ts::return_shared(cap);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = spending_cap::ENotOwner)]
    fun test_revoke_cap_not_owner_aborts() {
        let mut scenario = ts::begin(OWNER);
        setup_cap(&mut scenario, 100, 1_000_000, 100);

        ts::next_tx(&mut scenario, STRANGER);
        {
            let mut cap = ts::take_shared<SpendingCap<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            spending_cap::revoke_cap<SUI>(&mut cap, ctx);
            ts::return_shared(cap);
        };
        ts::end(scenario);
    }
}
