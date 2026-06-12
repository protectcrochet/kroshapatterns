// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FunDomeToken (FDT)
 * @notice Token de recompensa del juego Fun Dome (arena Luz vs Sombra).
 *
 * ⚠️ SOLO PARA TESTNET (Polygon Amoy).
 * Expone un `mint()` público para que el MVP pueda acreditar al jugador
 * los FDT que ganó jugando, sin necesidad de un backend con firma.
 * NO desplegar tal cual en mainnet: en producción el mint debe ir detrás
 * de una firma del servidor o un rol con permisos (Ownable / AccessControl).
 *
 * Implementación ERC-20 mínima y autocontenida (sin dependencias externas)
 * para que pueda compilarse y desplegarse fácilmente en Remix.
 */
contract FunDomeToken {
    string public constant name = "Fun Dome Token";
    string public constant symbol = "FDT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @notice Acuña `amount` tokens para `to`.
     * @dev Público a propósito para el MVP en testnet (ver advertencia arriba).
     */
    function mint(address to, uint256 amount) external {
        require(to != address(0), "mint to zero");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "transfer to zero");
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
