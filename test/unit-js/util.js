/**
 * Get the first event with the given name from the given logs
 * @param {Array<{eventName:string}>} events
 * @param {string} name
 * @returns {*}
 */
const { expect } = require("chai");

function getContractEvent(events, name) {
    return events.find(({eventName}) => eventName === name);
}

const BLS12381_G1_POINTS = [
    "0000000000000000000000000000000014ea54b24c3dae4c5d072e75299096f9c3d4c6902112bdb45ef18281bfc4143b240662d454316092acebafdc7fb427cb0000000000000000000000000000000013b8723cc024f36fec399ced021d647a9c3ecaf5ddb6b4bdb0e0a851f6280b22163912ade7128db8a5266490fd682f15",
    "000000000000000000000000000000000bfa3744fcf5c6a0912ac843e80328b740a9d131db826ac2e60dac5d9e89e9be5ae19e3919acceb6288b3042c941d573000000000000000000000000000000001177fd0de9c92fc5d8fd299731603e29d44c0e0e0ddb8635684cce32a3f5f723f1ced66f5b4364040327f2284297d0dd",
    "000000000000000000000000000000000412bf056088f546c24249b0798aaa00688ac8cf33846d4646d406bfaf63478ed37f098172a1e859266c3445ea58bcc200000000000000000000000000000000092eeb64d67f477b3f88de214ced427bdeabbb72e16c97cd61f81f3d44d7802b906ac5ea71b80eae4c5df7471a31887d",
    "000000000000000000000000000000000cfe31dc1132f0528a8de98dd346993fc4c022d1ed79c746e2649dd54c2aa2c9dbbca0502d96dc5cafc3c48d2603086600000000000000000000000000000000123aa60b3fba7b9f12caf51a7e23f1ab4d88c54433fa35bfb788b8ba496dca2edca245590ad11712ce83dc65b9cac73e",
    "000000000000000000000000000000000663d92585056d6050ed9d9f1c75727239dfc787cbd5d53886dc1a19befcba22df7a229e2f12215500d5021a594098d200000000000000000000000000000000106d6795f6e1de492ba90475f3719eb131a04fc40080684df4451827b905ebf4541959beaaad2d312007e929061b8b71",
    "000000000000000000000000000000001217dae0151eae4d4a0b6cd4144213d144062f12cfb90062b6d2a95aeb2e6d096fb069351462cfbfb6d2cff779b21e9a00000000000000000000000000000000188f1fd209c31dde84361c187c4aa621b7d7a02a8f2595c5488cbc15e8f9f145edebc4b7135d2e7dd250009edccb105e",
    "00000000000000000000000000000000120dc9d19e6f8cef952ffb6c64f7f74f70ca2236962dbbabf5c627185b65717559175aefc876fc9ea98c799a505c268200000000000000000000000000000000047a4a254eec8a54b7d94de6d734527c806b52c3e354fd517f5f5a0910b5998fe06fb39ca32372083888132f63ca0d37",
    "000000000000000000000000000000000d491856f70cec3478579b800a27af26bea4448b6980545d501a155fd15f3269a11fb735ae8e72baeb8073ad1f4a89200000000000000000000000000000000003c2e29f8dfdddbb531cb9c6a9ec7867f43d18151a224e1b12f2457cbf38ae0275f6123566a1455e8a9b2e00a30d59a7",
    "000000000000000000000000000000000b86f0c8d37f7c1403b39db3e028a12b78797f0ead0ab95281a59bdea2886218fab86752878b78659c4e0f7d9cff4fb80000000000000000000000000000000003ee949cb7be6cbe9bdd1e7808c67e8f8e5db400e8d1bb8eba82fc6c2f91bba737d1c98edbc20c0ccec72b7432392802",
    "000000000000000000000000000000000a81bd6119fc94a96c1548ce8b62b9f17ad414527b826c8475a7bc4efeead7d5f5352eed4c7dff98c9624fba114713ac0000000000000000000000000000000013d18fe210433aad778f0415240c6840f692387ae65cb31a548a581b096e7381437678052d6b2ff36d63965ccf17f277",
    "0000000000000000000000000000000001f15ea691d13687f5f796c786722eebdc2e48c0db2229dfa995da299e330879b7874be19d505b9db18a9ad841a9f4270000000000000000000000000000000012adb6a728de37fc21fb7097017304f6b8225046c6aaa83fd8dec6d68c0880ab6162ba7a975da3a7bb3709ddc089200d",
    "0000000000000000000000000000000014005b8b25623735a6fbfcfe07305fd5fec93a72523d8b39f72553f93a2512957e802d85b04d6bdbf02ee5725d261eeb00000000000000000000000000000000020b0ab1d2a41e6cff0bb950e13b75a0d59130c497b86e196c3e72e5695da6cdcefed694eacdee9ac5236268bd9eda08",
];

const legacyG1Map = new Map();

function blsG1(index) {
    return { data: `0x${BLS12381_G1_POINTS[index % BLS12381_G1_POINTS.length]}` };
}

function blsScalar(index) {
    return `0x${(0x201n + BigInt(index)).toString(16).padStart(64, "0")}`;
}

function zeroBlsG1() {
    return { data: `0x${"00".repeat(128)}` };
}

function invalidBlsG1WithZeroX(index = 0) {
    const data = BLS12381_G1_POINTS[index % BLS12381_G1_POINTS.length];
    return { data: `0x${"00".repeat(64)}${data.slice(128)}` };
}

function invalidBlsG1WithZeroY(index = 0) {
    const data = BLS12381_G1_POINTS[index % BLS12381_G1_POINTS.length];
    return { data: `0x${data.slice(0, 128)}${"00".repeat(64)}` };
}

function invalidBlsG1Short() {
    return { data: `0x${"00".repeat(127)}` };
}

function invalidBlsG1Long() {
    return { data: `0x${"00".repeat(129)}` };
}

function legacyG1(x, y) {
    if (BigInt(x) === 0n && BigInt(y) === 0n) {
        return zeroBlsG1();
    }

    const key = `${x?.toString()}:${y?.toString()}`;
    if (!legacyG1Map.has(key)) {
        legacyG1Map.set(key, legacyG1Map.size);
    }

    return blsG1(legacyG1Map.get(key));
}

function normalizeBlsG1(point) {
    if (typeof point === "string") {
        return { data: point };
    }

    if (point?.data) {
        return point;
    }

    if (Array.isArray(point)) {
        return legacyG1(point[0], point[1]);
    }

    if (point?.X !== undefined && point?.Y !== undefined) {
        return legacyG1(point.X, point.Y);
    }

    return point;
}

function invalidBlsSignature() {
    return { signature: `0x${"00".repeat(256)}` };
}

function normalizeSeedData(seedData) {
    return seedData.map(item => ({
        ...item,
        blsPubkey: normalizeBlsG1(item.blsPubkey),
    }));
}

function expectBlsG1Equal(actual, expected) {
    expect(normalizeBlsG1(actual).data).to.equal(normalizeBlsG1(expected).data);
}

module.exports = {
    blsG1,
    blsScalar,
    expectBlsG1Equal,
    getContractEvent,
    invalidBlsG1Long,
    invalidBlsG1Short,
    invalidBlsG1WithZeroX,
    invalidBlsG1WithZeroY,
    invalidBlsSignature,
    legacyG1,
    normalizeBlsG1,
    normalizeSeedData,
    zeroBlsG1,
}
