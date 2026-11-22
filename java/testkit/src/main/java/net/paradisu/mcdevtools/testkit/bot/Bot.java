/*
 * mcdevtools: development tools for Minecraft plugin projects. Copyright (C) 2026 Paradisu. https://github.com/Paradisu/mcdevtools
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

package net.paradisu.mcdevtools.testkit.bot;

import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import net.paradisu.mcdevtools.testkit.bot.screen.Screen;
import net.paradisu.mcdevtools.testkit.env.Protocol;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.InstanceInfo;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.Target;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment.Via;
import org.cloudburstmc.math.vector.Vector3d;
import org.cloudburstmc.math.vector.Vector3i;
import org.cloudburstmc.nbt.NbtMap;
import org.geysermc.mcprotocollib.network.BuiltinFlags;
import org.geysermc.mcprotocollib.network.Session;
import org.geysermc.mcprotocollib.network.event.session.DisconnectedEvent;
import org.geysermc.mcprotocollib.network.event.session.SessionAdapter;
import org.geysermc.mcprotocollib.network.factory.ClientNetworkSessionFactory;
import org.geysermc.mcprotocollib.network.packet.Packet;
import org.geysermc.mcprotocollib.network.session.ClientNetworkSession;
import org.geysermc.mcprotocollib.protocol.MinecraftConstants;
import org.geysermc.mcprotocollib.protocol.MinecraftProtocol;
import org.geysermc.mcprotocollib.protocol.data.game.ClientCommand;
import org.geysermc.mcprotocollib.protocol.data.game.PlayerListEntry;
import org.geysermc.mcprotocollib.protocol.data.game.PlayerListEntryAction;
import org.geysermc.mcprotocollib.protocol.data.game.entity.object.Direction;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.GameMode;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.Hand;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.HandPreference;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.PlayerAction;
import org.geysermc.mcprotocollib.protocol.data.game.entity.player.PositionElement;
import org.geysermc.mcprotocollib.protocol.data.game.inventory.ClickItemAction;
import org.geysermc.mcprotocollib.protocol.data.game.inventory.ContainerAction;
import org.geysermc.mcprotocollib.protocol.data.game.inventory.ContainerActionType;
import org.geysermc.mcprotocollib.protocol.data.game.inventory.DropItemAction;
import org.geysermc.mcprotocollib.protocol.data.game.inventory.MoveToHotbarAction;
import org.geysermc.mcprotocollib.protocol.data.game.inventory.ShiftClickItemAction;
import org.geysermc.mcprotocollib.protocol.data.game.scoreboard.ObjectiveAction;
import org.geysermc.mcprotocollib.protocol.data.game.scoreboard.ScoreboardPosition;
import org.geysermc.mcprotocollib.protocol.data.game.setting.ChatVisibility;
import org.geysermc.mcprotocollib.protocol.data.game.setting.ParticleStatus;
import org.geysermc.mcprotocollib.protocol.data.game.setting.SkinPart;
import org.geysermc.mcprotocollib.protocol.packet.common.clientbound.ClientboundDisconnectPacket;
import org.geysermc.mcprotocollib.protocol.packet.common.clientbound.ClientboundPingPacket;
import org.geysermc.mcprotocollib.protocol.packet.common.clientbound.ClientboundStoreCookiePacket;
import org.geysermc.mcprotocollib.protocol.packet.common.clientbound.ClientboundTransferPacket;
import org.geysermc.mcprotocollib.protocol.packet.common.serverbound.ServerboundClientInformationPacket;
import org.geysermc.mcprotocollib.protocol.packet.common.serverbound.ServerboundCustomClickActionPacket;
import org.geysermc.mcprotocollib.protocol.packet.common.serverbound.ServerboundPongPacket;
import org.geysermc.mcprotocollib.protocol.packet.cookie.clientbound.ClientboundCookieRequestPacket;
import org.geysermc.mcprotocollib.protocol.packet.cookie.serverbound.ServerboundCookieResponsePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundBossEventPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundDisguisedChatPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundLoginPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundPlayerChatPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundPlayerInfoRemovePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundPlayerInfoUpdatePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundRespawnPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundShowDialogGamePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundSystemChatPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.ClientboundTabListPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.player.ClientboundPlayerPositionPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.entity.player.ClientboundSetHealthPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.inventory.ClientboundContainerClosePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.inventory.ClientboundContainerSetContentPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.inventory.ClientboundContainerSetDataPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.inventory.ClientboundContainerSetSlotPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.inventory.ClientboundOpenScreenPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.inventory.ClientboundSetCursorItemPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.level.ClientboundChunkBatchFinishedPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.level.ClientboundOpenSignEditorPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.scoreboard.ClientboundResetScorePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.scoreboard.ClientboundSetDisplayObjectivePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.scoreboard.ClientboundSetObjectivePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.scoreboard.ClientboundSetScorePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.title.ClientboundSetActionBarTextPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.title.ClientboundSetSubtitleTextPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.clientbound.title.ClientboundSetTitleTextPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundChatCommandPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundChatPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundClientCommandPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundClientTickEndPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.ServerboundPlayerLoadedPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.inventory.ServerboundContainerClickPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.inventory.ServerboundContainerClosePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.inventory.ServerboundRenameItemPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.level.ServerboundAcceptTeleportationPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.level.ServerboundChunkBatchReceivedPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.level.ServerboundSignUpdatePacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundAttackPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundInteractPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundMovePlayerPosRotPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundMovePlayerStatusOnlyPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundPlayerActionPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundSetCarriedItemPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundUseItemOnPacket;
import org.geysermc.mcprotocollib.protocol.packet.ingame.serverbound.player.ServerboundUseItemPacket;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * A headless Minecraft player for tests: it joins a server over the protocol, keeps the connection alive, follows
 * transfers, and records chat, packets and screens so tests can assert on them.
 *
 * <p>It models what a test needs, not a full client: no world, no physics and no pathfinding. Movement is a straight
 * line, and inventory clicks are not predicted (the server's answer is the truth).
 *
 * <p>All methods are thread-safe. Packet handlers run on the network thread and must stay quick.
 */
public final class Bot implements AutoCloseable {
    /** Packets that are only counted, never kept, because they are bulky and rarely asserted on. */
    private static final Set<String> BULKY = Set.of(
            "ClientboundLevelChunkWithLightPacket",
            "ClientboundLightUpdatePacket",
            "ClientboundChunksBiomesPacket",
            "ClientboundForgetLevelChunkPacket",
            "ClientboundMoveEntityPosPacket",
            "ClientboundMoveEntityPosRotPacket",
            "ClientboundMoveEntityRotPacket",
            "ClientboundRotateHeadPacket",
            "ClientboundSetEntityMotionPacket",
            "ClientboundTeleportEntityPacket",
            "ClientboundEntityPositionSyncPacket",
            "ClientboundSetEntityDataPacket",
            "ClientboundUpdateAttributesPacket",
            "ClientboundSectionBlocksUpdatePacket",
            "ClientboundBlockUpdatePacket",
            "ClientboundSetTimePacket",
            "ClientboundUpdateTagsPacket",
            "ClientboundRegistryDataPacket");

    private static final double SPEED = 0.2;

    private final TestEnvironment env;
    private final BotOptions options;
    private final Protocol protocol;
    private final Target target;
    private final MinecraftProtocol minecraft;
    private final EventLog<ChatLine> chat = new EventLog<>(1000);
    private final EventLog<PacketEntry> packets;
    private final EventLog<String> events = new EventLog<>(500);
    private final Map<Key, byte[]> cookies = new ConcurrentHashMap<>();
    private final AtomicInteger sequence = new AtomicInteger();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "mcdev-bot-tick");
        t.setDaemon(true);
        return t;
    });
    private final CompletableFuture<Void> joined = new CompletableFuture<>();
    private final Object stateLock = new Object();

    private volatile ClientNetworkSession session;
    private volatile String host;
    private volatile int port;
    private volatile boolean closed;
    private volatile boolean needLoaded;
    private volatile boolean inGame;
    private volatile long ticks;

    // state, guarded by stateLock
    private double x;
    private double y;
    private double z;
    private float yaw;
    private float pitch;
    private float health = 20;
    private int food = 20;
    private int entityId;
    private GameMode gameMode = GameMode.SURVIVAL;
    private Vector3d moveTarget;
    private Screen screen;
    private final Screen inventory;
    private Vector3i signPos;
    private boolean signFront = true;
    private String dialog = "";
    private Component tabHeader = Component.empty();
    private Component tabFooter = Component.empty();
    private final Map<UUID, String> tabPlayers = new TreeMap<>();
    private final Map<UUID, String> bossBars = new HashMap<>();
    private String title = "";
    private String subtitle = "";
    private final Map<String, String> objectives = new HashMap<>();
    private final Map<String, Map<String, Integer>> scores = new HashMap<>();
    private final Map<String, String> scoreNames = new HashMap<>();
    private String sidebarObjective;

    private Bot(TestEnvironment env, BotOptions options, Target target) {
        this.env = env;
        this.options = options;
        this.target = target;
        this.protocol = Protocol.load(env.protocolFile);
        this.packets = new EventLog<>(options.packetLog);
        this.inventory = new Screen(0, "PLAYER", "Inventory", protocol);
        this.screen = null;
        this.host = target.instance().host;
        this.port = target.instance().port;
        this.minecraft = options.profile != null
                ? new MinecraftProtocol(options.profile, options.accessToken)
                : new MinecraftProtocol(options.name);
    }

    /**
     * Connects a bot and waits until it is in the game.
     *
     * @param env the network description
     * @param options the bot settings
     * @return the joined bot
     * @throws IllegalStateException when the target cannot be reached or the server refuses the bot
     */
    public static Bot connect(TestEnvironment env, BotOptions options) {
        Target target = resolve(env, options);
        Bot bot = new Bot(env, options, target);
        bot.open(bot.host, bot.port, false);
        try {
            bot.joined.get(options.connectTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            bot.close();
            throw new IllegalStateException("Bot " + options.name + " did not finish joining "
                    + target.instance().name + " within " + options.connectTimeout.toSeconds() + " s. Events: "
                    + bot.events.last(10).stream().map(EventLog.Entry::value).toList());
        } catch (Exception e) {
            bot.close();
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            throw new IllegalStateException(cause.getMessage(), cause);
        }
        return bot;
    }

    private static Target resolve(TestEnvironment env, BotOptions options) {
        Target target;
        if (options.target != null) {
            InstanceInfo instance = env.instance(options.target);
            Via via = options.via != null ? options.via : instance.isProxy() ? Via.PROXY : Via.DIRECT;
            target = new Target(instance, via);
        } else {
            target = env.defaultTarget()
                    .orElseThrow(() -> new IllegalStateException("No running instance to join; run `mcdev start`"));
            if (options.via != null && options.via != target.via()) {
                InstanceInfo instance = env.running().stream()
                        .filter(i -> options.via == Via.PROXY ? i.isProxy() : i.isBackend())
                        .findFirst()
                        .orElseThrow(() -> new IllegalStateException("No running instance reachable " + options.via));
                target = new Target(instance, options.via);
            }
        }
        InstanceInfo instance = target.instance();
        if (!instance.running) {
            throw new IllegalStateException("Instance " + instance.name + " is not running");
        }
        if (target.via() == Via.PROXY && !instance.isProxy() && "backend".equals(instance.role)) {
            throw new IllegalStateException(
                    instance.name + " is a backend; join it with via(DIRECT) or target the proxy");
        }
        if (instance.onlineMode && options.profile == null) {
            throw new IllegalStateException(instance.name + " is online-mode, so the bot needs a Microsoft account "
                    + "(mcdev bot login). To test without one, join a backend directly (via DIRECT), or run an "
                    + "offline-mode network.");
        }
        return target;
    }

    private ClientNetworkSession open(String host, int port, boolean transferring) {
        ClientNetworkSession next = ClientNetworkSessionFactory.factory()
                .setAddress(host, port)
                .setProtocol(minecraft)
                .create();
        next.setFlag(MinecraftConstants.FOLLOW_TRANSFERS, false);
        next.setFlag(MinecraftConstants.SEND_BLANK_KNOWN_PACKS_RESPONSE, true);
        if (transferring) {
            next.setFlag(BuiltinFlags.CLIENT_TRANSFERRING, true);
        }
        InstanceInfo instance = target.instance();
        if (!transferring && target.via() == Via.DIRECT && "legacy".equals(instance.forwarding)) {
            UUID uuid = ForwardingResponder.offlineUuid(options.name);
            next.setFlag(MinecraftConstants.CLIENT_HOST, ForwardingResponder.legacyHost(host, "127.0.0.1", uuid));
        }
        next.addListener(new Listener());
        session = next;
        this.host = host;
        this.port = port;
        events.append((transferring ? "transfer to " : "connecting to ") + host + ":" + port);
        next.connect(false);
        return next;
    }

    /** The packet listener of one session; stale sessions (before a transfer) are ignored. */
    private final class Listener extends SessionAdapter {
        @Override
        public void packetReceived(Session s, Packet packet) {
            if (s != session) {
                return;
            }
            String name = packet.getClass().getSimpleName();
            packets.append(new PacketEntry(true, name, BULKY.contains(name) ? null : packet, Instant.now()));
            try {
                handle(s, packet);
            } catch (RuntimeException e) {
                events.append("error handling " + name + ": " + e);
            }
        }

        @Override
        public void packetSent(Session s, Packet packet) {
            if (s != session) {
                return;
            }
            String name = packet.getClass().getSimpleName();
            if (!name.startsWith("ServerboundMovePlayer")
                    && !name.equals("ServerboundClientTickEndPacket")
                    && !name.equals("ServerboundKeepAlivePacket")) {
                packets.append(new PacketEntry(false, name, packet, Instant.now()));
            }
        }

        @Override
        public void disconnected(DisconnectedEvent event) {
            if (event.getSession() != session) {
                return;
            }
            String reason = Text.plain(event.getReason());
            if (event.getCause() != null && reason.isBlank()) {
                reason = String.valueOf(event.getCause());
            }
            inGame = false;
            events.append("disconnected: " + reason);
            chat.append(new ChatLine(ChatLine.Kind.DISCONNECT, reason, "", Instant.now()));
            if (!joined.isDone()) {
                joined.completeExceptionally(new IllegalStateException("Disconnected while joining "
                        + target.instance().name + ": " + reason
                        + (event.getCause() != null ? " (" + event.getCause() + ")" : "")));
            }
        }
    }

    private void handle(Session s, Packet packet) {
        if (packet
                instanceof
                org.geysermc.mcprotocollib.protocol.packet.login.clientbound.ClientboundCustomQueryPacket q) {
            answerQuery(s, q);
        } else if (packet instanceof ClientboundLoginPacket login) {
            synchronized (stateLock) {
                entityId = login.getEntityId();
                gameMode = login.getCommonPlayerSpawnInfo().getGameMode();
            }
            needLoaded = true;
            events.append("login: entity " + login.getEntityId());
            s.send(new ServerboundClientInformationPacket(
                    options.locale,
                    options.viewDistance,
                    ChatVisibility.FULL,
                    true,
                    List.of(SkinPart.values()),
                    HandPreference.RIGHT_HAND,
                    false,
                    true,
                    ParticleStatus.MINIMAL));
        } else if (packet instanceof ClientboundRespawnPacket respawn) {
            needLoaded = true;
            synchronized (stateLock) {
                gameMode = respawn.getCommonPlayerSpawnInfo().getGameMode();
            }
            events.append("respawn");
        } else if (packet instanceof ClientboundPlayerPositionPacket pos) {
            applyPosition(s, pos);
        } else if (packet instanceof ClientboundSetHealthPacket h) {
            synchronized (stateLock) {
                health = h.getHealth();
                food = h.getFood();
            }
            if (h.getHealth() <= 0 && options.autoRespawn) {
                events.append("died; respawning");
                s.send(new ServerboundClientCommandPacket(ClientCommand.PERFORM_RESPAWN));
            }
        } else if (packet instanceof ClientboundChunkBatchFinishedPacket) {
            s.send(new ServerboundChunkBatchReceivedPacket(20f));
        } else if (packet instanceof ClientboundPingPacket ping) {
            s.send(new ServerboundPongPacket(ping.getId()));
        } else if (packet instanceof ClientboundStoreCookiePacket cookie) {
            cookies.put(cookie.getKey(), cookie.getPayload());
        } else if (packet instanceof ClientboundCookieRequestPacket request) {
            s.send(new ServerboundCookieResponsePacket(request.getKey(), cookies.get(request.getKey())));
        } else if (packet instanceof ClientboundTransferPacket transfer) {
            transfer(transfer.getHost(), transfer.getPort());
        } else if (packet instanceof ClientboundDisconnectPacket) {
            // the library disconnects the session; DisconnectedEvent records the reason
        } else {
            handleGame(s, packet);
        }
    }

    private void handleGame(Session s, Packet packet) {
        if (packet instanceof ClientboundSystemChatPacket c) {
            chat.append(new ChatLine(
                    c.isOverlay() ? ChatLine.Kind.ACTION_BAR : ChatLine.Kind.SYSTEM,
                    Text.plain(c.getContent()),
                    "",
                    Instant.now()));
        } else if (packet instanceof ClientboundPlayerChatPacket c) {
            String content = c.getUnsignedContent() != null ? Text.plain(c.getUnsignedContent()) : c.getContent();
            chat.append(new ChatLine(ChatLine.Kind.PLAYER, content, Text.plain(c.getName()), Instant.now()));
        } else if (packet instanceof ClientboundDisguisedChatPacket c) {
            chat.append(new ChatLine(
                    ChatLine.Kind.PLAYER, Text.plain(c.getMessage()), Text.plain(c.getName()), Instant.now()));
        } else if (packet instanceof ClientboundSetActionBarTextPacket c) {
            chat.append(new ChatLine(ChatLine.Kind.ACTION_BAR, Text.plain(c.getText()), "", Instant.now()));
        } else if (packet instanceof ClientboundSetTitleTextPacket c) {
            title = Text.plain(c.getText());
            chat.append(new ChatLine(ChatLine.Kind.TITLE, title, "", Instant.now()));
        } else if (packet instanceof ClientboundSetSubtitleTextPacket c) {
            subtitle = Text.plain(c.getText());
            chat.append(new ChatLine(ChatLine.Kind.SUBTITLE, subtitle, "", Instant.now()));
        } else if (packet instanceof ClientboundTabListPacket c) {
            synchronized (stateLock) {
                tabHeader = c.getHeader();
                tabFooter = c.getFooter();
            }
        } else if (packet instanceof ClientboundPlayerInfoUpdatePacket c) {
            synchronized (stateLock) {
                if (c.getActions().contains(PlayerListEntryAction.ADD_PLAYER)) {
                    for (PlayerListEntry e : c.getEntries()) {
                        if (e.getProfile() != null) {
                            tabPlayers.put(e.getProfileId(), e.getProfile().getName());
                        }
                    }
                }
            }
        } else if (packet instanceof ClientboundPlayerInfoRemovePacket c) {
            synchronized (stateLock) {
                c.getProfileIds().forEach(tabPlayers::remove);
            }
        } else if (packet instanceof ClientboundBossEventPacket c) {
            synchronized (stateLock) {
                switch (c.getAction()) {
                    case ADD, UPDATE_TITLE -> bossBars.put(c.getUuid(), Text.plain(c.getTitle()));
                    case REMOVE -> bossBars.remove(c.getUuid());
                    default -> {}
                }
            }
        } else if (packet instanceof ClientboundOpenScreenPacket c) {
            Screen opened = new Screen(c.getContainerId(), c.getType().name(), Text.plain(c.getTitle()), protocol);
            synchronized (stateLock) {
                screen = opened;
            }
            events.append("screen opened: " + opened.type() + " \"" + opened.title() + "\"");
        } else if (packet instanceof ClientboundContainerSetContentPacket c) {
            Screen target = screenFor(c.getContainerId());
            if (target != null) {
                target.setContent(c.getStateId(), c.getItems(), c.getCarriedItem());
            }
        } else if (packet instanceof ClientboundContainerSetSlotPacket c) {
            Screen target = screenFor(c.getContainerId());
            if (target != null) {
                target.setSlot(c.getStateId(), c.getSlot(), c.getItem());
            }
        } else if (packet instanceof ClientboundSetCursorItemPacket c) {
            synchronized (stateLock) {
                if (screen != null) {
                    screen.setCursor(c.getContents());
                } else {
                    inventory.setCursor(c.getContents());
                }
            }
        } else if (packet instanceof ClientboundContainerSetDataPacket c) {
            Screen target = screenFor(c.getContainerId());
            if (target != null) {
                target.setProperty(c.getRawProperty(), c.getValue());
            }
        } else if (packet instanceof ClientboundContainerClosePacket c) {
            synchronized (stateLock) {
                if (screen != null && screen.containerId() == c.getContainerId()) {
                    screen = null;
                    events.append("screen closed");
                }
            }
        } else if (packet instanceof ClientboundOpenSignEditorPacket c) {
            synchronized (stateLock) {
                signPos = c.getPosition();
                signFront = c.isFrontText();
            }
            events.append("sign editor opened");
        } else if (packet instanceof ClientboundShowDialogGamePacket c) {
            NbtMap map = c.getDialog().isCustom() ? c.getDialog().custom() : null;
            dialog = map == null ? String.valueOf(c.getDialog()) : map.toString();
            events.append("dialog shown");
        } else if (packet instanceof ClientboundSetObjectivePacket c) {
            synchronized (stateLock) {
                if (c.getAction() == ObjectiveAction.REMOVE) {
                    objectives.remove(c.getName());
                    scores.remove(c.getName());
                } else {
                    objectives.put(c.getName(), Text.plain(c.getDisplayName()));
                }
            }
        } else if (packet instanceof ClientboundSetDisplayObjectivePacket c) {
            synchronized (stateLock) {
                if (c.getPosition() == ScoreboardPosition.SIDEBAR) {
                    sidebarObjective = c.getName().isEmpty() ? null : c.getName();
                }
            }
        } else if (packet instanceof ClientboundSetScorePacket c) {
            synchronized (stateLock) {
                scores.computeIfAbsent(c.getObjective(), k -> new HashMap<>()).put(c.getOwner(), c.getValue());
                scoreNames.put(
                        c.getObjective() + "\0" + c.getOwner(),
                        c.getDisplay() != null ? Text.plain(c.getDisplay()) : c.getOwner());
            }
        } else if (packet instanceof ClientboundResetScorePacket c) {
            synchronized (stateLock) {
                Map<String, Integer> map = scores.get(c.getObjective());
                if (map != null) {
                    map.remove(c.getOwner());
                }
            }
        }
    }

    private Screen screenFor(int containerId) {
        synchronized (stateLock) {
            if (containerId == 0) {
                return inventory;
            }
            return screen != null && screen.containerId() == containerId ? screen : null;
        }
    }

    private void answerQuery(
            Session s, org.geysermc.mcprotocollib.protocol.packet.login.clientbound.ClientboundCustomQueryPacket q) {
        InstanceInfo instance = target.instance();
        if (q.getChannel().asString().equals("velocity:player_info")
                && target.via() == Via.DIRECT
                && "modern".equals(instance.forwarding)) {
            byte[] secret = readSecret(instance);
            UUID uuid = ForwardingResponder.offlineUuid(options.name);
            byte[] answer = ForwardingResponder.modernAnswer(secret, "127.0.0.1", uuid, options.name);
            s.send(new org.geysermc.mcprotocollib.protocol.packet.login.serverbound.ServerboundCustomQueryAnswerPacket(
                    q.getMessageId(), answer));
            events.append("answered modern forwarding");
        } else {
            s.send(new org.geysermc.mcprotocollib.protocol.packet.login.serverbound.ServerboundCustomQueryAnswerPacket(
                    q.getMessageId()));
        }
    }

    private static byte[] readSecret(InstanceInfo instance) {
        try {
            return Files.readString(Path.of(instance.forwardingSecretFile), StandardCharsets.UTF_8)
                    .trim()
                    .getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Cannot read the forwarding secret of " + instance.name + ": " + e.getMessage(), e);
        }
    }

    private void applyPosition(Session s, ClientboundPlayerPositionPacket pos) {
        double nx;
        double ny;
        double nz;
        float nyaw;
        float npitch;
        synchronized (stateLock) {
            List<PositionElement> rel = pos.getRelatives();
            nx = rel.contains(PositionElement.X)
                    ? x + pos.getPosition().getX()
                    : pos.getPosition().getX();
            ny = rel.contains(PositionElement.Y)
                    ? y + pos.getPosition().getY()
                    : pos.getPosition().getY();
            nz = rel.contains(PositionElement.Z)
                    ? z + pos.getPosition().getZ()
                    : pos.getPosition().getZ();
            nyaw = rel.contains(PositionElement.Y_ROT) ? yaw + pos.getYRot() : pos.getYRot();
            npitch = rel.contains(PositionElement.X_ROT) ? pitch + pos.getXRot() : pos.getXRot();
            x = nx;
            y = ny;
            z = nz;
            yaw = nyaw;
            pitch = npitch;
            moveTarget = null;
        }
        s.send(new ServerboundAcceptTeleportationPacket(pos.getId(), nx, ny, nz, nyaw, npitch));
        s.send(new ServerboundMovePlayerPosRotPacket(true, false, nx, ny, nz, nyaw, npitch));
        s.send(ServerboundClientTickEndPacket.INSTANCE);
        if (needLoaded) {
            needLoaded = false;
            s.send(ServerboundPlayerLoadedPacket.INSTANCE);
        }
        if (!inGame) {
            inGame = true;
            events.append("in game at " + String.format("%.1f %.1f %.1f", nx, ny, nz) + " on " + server());
            if (!closed) {
                startTicking();
            }
            joined.complete(null);
        }
    }

    private void transfer(String newHost, int newPort) {
        events.append("transfer requested to " + newHost + ":" + newPort);
        ClientNetworkSession old = session;
        inGame = false;
        // the new session replaces the old one first, so the old one's disconnect is ignored
        open(newHost, newPort, true);
        old.disconnect("transfer");
    }

    private void startTicking() {
        ticker.scheduleAtFixedRate(this::tick, 50, 50, TimeUnit.MILLISECONDS);
    }

    private void tick() {
        try {
            ClientNetworkSession s = session;
            if (!inGame || closed || s == null || !s.isConnected()) {
                return;
            }
            long n = ++ticks;
            synchronized (stateLock) {
                if (moveTarget != null) {
                    double dx = moveTarget.getX() - x;
                    double dy = moveTarget.getY() - y;
                    double dz = moveTarget.getZ() - z;
                    double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist <= SPEED) {
                        x = moveTarget.getX();
                        y = moveTarget.getY();
                        z = moveTarget.getZ();
                        moveTarget = null;
                    } else {
                        x += dx / dist * SPEED;
                        y += dy / dist * SPEED;
                        z += dz / dist * SPEED;
                        yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
                    }
                    s.send(new ServerboundMovePlayerPosRotPacket(true, false, x, y, z, yaw, pitch));
                } else if (n % 20 == 0) {
                    s.send(new ServerboundMovePlayerPosRotPacket(true, false, x, y, z, yaw, pitch));
                } else {
                    s.send(new ServerboundMovePlayerStatusOnlyPacket(true, false));
                }
                // Since 1.21.2 the server only accepts one position packet per client tick and learns where a tick
                // ends from this packet; without it the second position packet gets the player kicked.
                s.send(ServerboundClientTickEndPacket.INSTANCE);
            }
        } catch (RuntimeException e) {
            events.append("tick error: " + e);
        }
    }

    // ---- chat and commands -------------------------------------------------------------------------------------

    /**
     * Sends a chat message (unsigned: the server must not enforce secure chat, which the dev network does not).
     *
     * @param message the text
     */
    public void chat(String message) {
        send(new ServerboundChatPacket(message, System.currentTimeMillis(), 0L, null, 0, new java.util.BitSet(), 0));
    }

    /**
     * Runs a command as the player.
     *
     * @param command the command, with or without a leading slash
     */
    public void command(String command) {
        send(new ServerboundChatCommandPacket(command.startsWith("/") ? command.substring(1) : command));
    }

    /**
     * Sends any packet.
     *
     * @param packet the packet
     */
    public void send(Packet packet) {
        ClientNetworkSession s = session;
        if (s == null || !s.isConnected()) {
            throw new IllegalStateException("Bot " + options.name + " is not connected");
        }
        s.send(packet);
    }

    // ---- observation -------------------------------------------------------------------------------------------

    /**
     * Chat, system messages, titles and the disconnect reason.
     *
     * @return the log
     */
    public EventLog<ChatLine> chat() {
        return chat;
    }

    /**
     * Received and sent packets (movement and keep-alives excluded when sent; bulky packets without payload).
     *
     * @return the log
     */
    public EventLog<PacketEntry> packets() {
        return packets;
    }

    /**
     * Connection events: joins, transfers, screens, deaths, errors in packet handlers.
     *
     * @return the log
     */
    public EventLog<String> events() {
        return events;
    }

    /**
     * Waits for a chat line whose plain text matches.
     *
     * @param regex the pattern (searched, not matched in full)
     * @param timeout how long to wait
     * @param from a mark from {@code chat().mark()}
     * @return the line
     * @throws AssertionError when nothing matched in time
     */
    public ChatLine awaitChat(Pattern regex, Duration timeout, long from) {
        return chat.await(l -> regex.matcher(l.plain()).find(), timeout, from, "chat matching /" + regex + "/");
    }

    /**
     * Waits for a received packet of a type.
     *
     * @param type the packet class
     * @param filter an extra condition
     * @param timeout how long to wait
     * @param from a mark from {@code packets().mark()}
     * @param <T> the packet type
     * @return the packet
     * @throws AssertionError when nothing matched in time (bulky packets are never kept)
     */
    public <T extends Packet> T awaitPacket(Class<T> type, Predicate<T> filter, Duration timeout, long from) {
        PacketEntry entry = packets.await(
                e -> e.inbound() && type.isInstance(e.packet()) && filter.test(type.cast(e.packet())),
                timeout,
                from,
                "packet " + type.getSimpleName());
        return type.cast(entry.packet());
    }

    /**
     * The player name.
     *
     * @return the name
     */
    public String name() {
        return options.name;
    }

    /**
     * Whether the bot is connected and in the game.
     *
     * @return true when playing
     */
    public boolean inGame() {
        ClientNetworkSession s = session;
        return inGame && s != null && s.isConnected();
    }

    /**
     * The name of the instance the bot is on, found from the port it is connected to (it changes on transfers).
     *
     * @return the instance name, or {@code host:port} when no instance has that port
     */
    public String server() {
        return env.instances.stream()
                .filter(i -> i.port == port)
                .map(i -> i.name)
                .findFirst()
                .orElse(host + ":" + port);
    }

    /**
     * The player's position.
     *
     * @return x, y, z
     */
    public double[] position() {
        synchronized (stateLock) {
            return new double[] {x, y, z};
        }
    }

    /**
     * The player's entity id on the current server (needed to attack or interact with the player from another bot).
     *
     * @return the entity id
     */
    public int entityId() {
        synchronized (stateLock) {
            return entityId;
        }
    }

    /**
     * Health in half hearts.
     *
     * @return the health
     */
    public float health() {
        synchronized (stateLock) {
            return health;
        }
    }

    /**
     * The game mode.
     *
     * @return the game mode
     */
    public GameMode gameMode() {
        synchronized (stateLock) {
            return gameMode;
        }
    }

    /**
     * A one-paragraph status.
     *
     * @return the status text
     */
    public String status() {
        synchronized (stateLock) {
            return "name=" + options.name + " state=" + (inGame() ? "connected" : "disconnected") + " server="
                    + server() + String.format(" pos=%.1f,%.1f,%.1f", x, y, z) + " entity=" + entityId + " health="
                    + health + " food=" + food
                    + " gamemode=" + gameMode + " screen="
                    + (screen == null ? "none" : screen.type() + " \"" + screen.title() + "\"");
        }
    }

    // ---- screens -----------------------------------------------------------------------------------------------

    /**
     * The open container, or null when none is open.
     *
     * @return the screen
     */
    public Screen screen() {
        synchronized (stateLock) {
            return screen;
        }
    }

    /**
     * The player's own inventory (container 0), always available.
     *
     * @return the inventory
     */
    public Screen inventory() {
        return inventory;
    }

    /**
     * Waits for a screen to be open that satisfies a condition and has received its contents.
     *
     * @param condition the condition
     * @param timeout how long to wait
     * @return the screen
     * @throws AssertionError when none appeared in time
     */
    public Screen awaitScreen(Predicate<Screen> condition, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            Screen s = screen();
            if (s != null && s.size() > 0 && condition.test(s)) {
                return s;
            }
            sleep(25);
        }
        Screen s = screen();
        throw new AssertionError("Timed out waiting for a screen; "
                + (s == null ? "none is open" : "open: " + s.describe())
                + ". Events: "
                + events.last(10).stream().map(EventLog.Entry::value).toList());
    }

    /**
     * Clicks a slot of the open container (or the inventory when none is open) and waits for the server's answer.
     *
     * @param slot the slot index
     * @param click {@code left}, {@code right}, {@code shift}, {@code shift-right}, {@code drop}, {@code drop-stack} or
     *     {@code hotbar:<1-9>}
     * @return the screen after the answer
     */
    public Screen click(int slot, String click) {
        Screen s = screen() != null ? screen() : inventory;
        ContainerActionType type;
        ContainerAction param;
        switch (click.toLowerCase()) {
            case "left" -> {
                type = ContainerActionType.CLICK_ITEM;
                param = ClickItemAction.LEFT_CLICK;
            }
            case "right" -> {
                type = ContainerActionType.CLICK_ITEM;
                param = ClickItemAction.RIGHT_CLICK;
            }
            case "shift" -> {
                type = ContainerActionType.SHIFT_CLICK_ITEM;
                param = ShiftClickItemAction.LEFT_CLICK;
            }
            case "shift-right" -> {
                type = ContainerActionType.SHIFT_CLICK_ITEM;
                param = ShiftClickItemAction.RIGHT_CLICK;
            }
            case "drop" -> {
                type = ContainerActionType.DROP_ITEM;
                param = DropItemAction.DROP_FROM_SELECTED;
            }
            case "drop-stack" -> {
                type = ContainerActionType.DROP_ITEM;
                param = DropItemAction.DROP_SELECTED_STACK;
            }
            default -> {
                if (click.toLowerCase().startsWith("hotbar:")) {
                    int n = Integer.parseInt(click.substring(7));
                    type = ContainerActionType.MOVE_TO_HOTBAR_SLOT;
                    param = MoveToHotbarAction.values()[n - 1];
                } else {
                    throw new IllegalArgumentException("Unknown click '" + click
                            + "'; use left, right, shift, shift-right, drop, drop-stack or hotbar:<1-9>");
                }
            }
        }
        long before = s.version();
        send(new ServerboundContainerClickPacket(s.containerId(), s.stateId(), slot, type, param, null, Map.of()));
        s.awaitUpdate(before, 3000);
        return s;
    }

    /** Closes the open container. */
    public void closeScreen() {
        Screen s;
        synchronized (stateLock) {
            s = screen;
            screen = null;
        }
        send(new ServerboundContainerClosePacket(s == null ? 0 : s.containerId()));
    }

    /**
     * Types into an anvil's rename field.
     *
     * @param text the new name
     */
    public void renameItem(String text) {
        send(new ServerboundRenameItemPacket(text));
    }

    /**
     * Writes the sign the server asked the bot to edit.
     *
     * @param lines up to four lines
     */
    public void writeSign(List<String> lines) {
        Vector3i pos;
        boolean front;
        synchronized (stateLock) {
            pos = signPos;
            front = signFront;
        }
        if (pos == null) {
            throw new IllegalStateException("No sign editor is open");
        }
        List<String> four = new ArrayList<>(lines);
        while (four.size() < 4) {
            four.add("");
        }
        send(new ServerboundSignUpdatePacket(pos, four.subList(0, 4), front));
    }

    /**
     * The last dialog the server showed, as raw text (the protocol sends dialogs as NBT).
     *
     * @return the dialog, or empty
     */
    public String dialog() {
        return dialog;
    }

    /**
     * Answers a dialog button that runs a custom action.
     *
     * @param id the action id
     */
    public void customAction(String id) {
        send(new ServerboundCustomClickActionPacket(Key.key(id), NbtMap.EMPTY));
    }

    // ---- movement and interaction ------------------------------------------------------------------------------

    /**
     * Starts walking in a straight line towards a point (0.2 blocks per tick, no physics, no pathfinding).
     *
     * @param tx the x
     * @param ty the y
     * @param tz the z
     */
    public void moveTo(double tx, double ty, double tz) {
        synchronized (stateLock) {
            moveTarget = Vector3d.from(tx, ty, tz);
        }
    }

    /**
     * Walks to a point and waits until it is reached.
     *
     * @param tx the x
     * @param ty the y
     * @param tz the z
     * @param timeout how long to wait
     */
    public void moveToAndWait(double tx, double ty, double tz, Duration timeout) {
        moveTo(tx, ty, tz);
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            synchronized (stateLock) {
                if (moveTarget == null) {
                    return;
                }
            }
            sleep(25);
        }
        throw new AssertionError("Bot " + options.name + " did not reach " + tx + "," + ty + "," + tz + " in "
                + timeout.toMillis() + " ms; it is at " + java.util.Arrays.toString(position()));
    }

    /**
     * Turns the player.
     *
     * @param newYaw the yaw in degrees
     * @param newPitch the pitch in degrees
     */
    public void look(float newYaw, float newPitch) {
        synchronized (stateLock) {
            yaw = newYaw;
            pitch = newPitch;
        }
    }

    /**
     * Selects a hotbar slot.
     *
     * @param slot 0 to 8
     */
    public void selectHotbar(int slot) {
        send(new ServerboundSetCarriedItemPacket(slot));
    }

    /** Uses the held item. */
    public void useItem() {
        float[] look;
        synchronized (stateLock) {
            look = new float[] {yaw, pitch};
        }
        send(new ServerboundUseItemPacket(Hand.MAIN_HAND, sequence.incrementAndGet(), look[0], look[1]));
    }

    /**
     * Right-clicks a block.
     *
     * @param bx the block x
     * @param by the block y
     * @param bz the block z
     * @param face the face that is clicked
     */
    public void interactBlock(int bx, int by, int bz, Direction face) {
        send(new ServerboundUseItemOnPacket(
                Vector3i.from(bx, by, bz),
                face,
                Hand.MAIN_HAND,
                0.5f,
                0.5f,
                0.5f,
                false,
                false,
                sequence.incrementAndGet()));
    }

    /**
     * Breaks a block (reliable in creative mode; survival needs the dig time to pass).
     *
     * @param bx the block x
     * @param by the block y
     * @param bz the block z
     */
    public void breakBlock(int bx, int by, int bz) {
        Vector3i pos = Vector3i.from(bx, by, bz);
        send(new ServerboundPlayerActionPacket(
                PlayerAction.START_DIGGING, pos, Direction.UP, sequence.incrementAndGet()));
        send(new ServerboundPlayerActionPacket(
                PlayerAction.FINISH_DIGGING, pos, Direction.UP, sequence.incrementAndGet()));
    }

    /**
     * Attacks an entity.
     *
     * @param entity the entity id
     */
    public void attack(int entity) {
        send(new ServerboundAttackPacket(entity));
    }

    /**
     * Right-clicks an entity.
     *
     * @param entity the entity id
     */
    public void interactEntity(int entity) {
        send(new ServerboundInteractPacket(entity, Hand.MAIN_HAND, Vector3d.ZERO, false));
    }

    /** Drops the held item. */
    public void dropSelected() {
        send(new ServerboundPlayerActionPacket(PlayerAction.DROP_ITEM, Vector3i.ZERO, Direction.DOWN, 0));
    }

    // ---- rendered text -----------------------------------------------------------------------------------------

    /**
     * The sidebar scoreboard: its title, then the entries from the highest score down.
     *
     * @return the lines, empty when there is no sidebar
     */
    public List<String> sidebar() {
        synchronized (stateLock) {
            if (sidebarObjective == null) {
                return List.of();
            }
            List<String> out = new ArrayList<>();
            out.add(objectives.getOrDefault(sidebarObjective, sidebarObjective));
            Map<String, Integer> map = scores.getOrDefault(sidebarObjective, Map.of());
            map.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue(Comparator.reverseOrder()))
                    .forEach(e -> out.add(scoreNames.getOrDefault(sidebarObjective + "\0" + e.getKey(), e.getKey())));
            return out;
        }
    }

    /**
     * The tab list: header, player names, footer.
     *
     * @return the lines
     */
    public List<String> tabList() {
        synchronized (stateLock) {
            List<String> out = new ArrayList<>();
            out.add("header: " + Text.plain(tabHeader));
            out.add("players: " + String.join(", ", tabPlayers.values()));
            out.add("footer: " + Text.plain(tabFooter));
            return out;
        }
    }

    /**
     * The boss bar titles.
     *
     * @return the titles
     */
    public List<String> bossBars() {
        synchronized (stateLock) {
            return new ArrayList<>(bossBars.values());
        }
    }

    /**
     * The last title and subtitle.
     *
     * @return the lines
     */
    public List<String> titles() {
        return List.of("title: " + title, "subtitle: " + subtitle);
    }

    // ---- lifecycle ---------------------------------------------------------------------------------------------

    /** Disconnects from the server. The bot cannot be reused. */
    public void disconnect() {
        close();
    }

    @Override
    public void close() {
        if (closed) {
            return;
        }
        closed = true;
        ticker.shutdownNow();
        ClientNetworkSession s = session;
        if (s != null) {
            try {
                s.disconnect("bot closed");
            } catch (RuntimeException ignored) {
                // already gone
            }
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
