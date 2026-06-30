#include "service_node_rewards/basic.hpp"

#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_all.hpp>

#include <algorithm>
#include <cstdint>

unsigned int Factorial( unsigned int number ) {
    return number <= 1 ? number : Factorial(number-1)*number;
}

TEST_CASE( "Factorials are computed", "[factorial]" ) {
    REQUIRE( Factorial(1) == 1 );
    REQUIRE( Factorial(2) == 2 );
    REQUIRE( Factorial(3) == 6 );
    REQUIRE( Factorial(10) == 3628800 );
}

TEST_CASE( "TempAddTest", "[tmp]" ) {
    REQUIRE( basic::add(1,2) == 3 );
}

TEST_CASE( "Reward emission is capped by pool and active stake", "[rewards][emission]" ) {
    constexpr std::uint64_t reward_pool = 40'000'000;
    constexpr std::uint64_t stake_per_node = 25'000;
    const auto annual_emission = [](std::uint64_t pool, std::uint64_t active_stake) {
        return std::min(pool * 14 / 100, active_stake * 30 / 100);
    };

    REQUIRE( annual_emission(reward_pool, 3 * stake_per_node) == 22'500 );
    REQUIRE( annual_emission(reward_pool, 100 * stake_per_node) == 750'000 );
    REQUIRE( annual_emission(reward_pool, 500 * stake_per_node) == 3'750'000 );
    REQUIRE( annual_emission(reward_pool, 748 * stake_per_node) == 5'600'000 );
}
