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

package net.paradisu.mcdevtools.testkit.auth;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.lenni0451.commons.httpclient.HttpClient;
import net.paradisu.mcdevtools.testkit.bot.BotOptions;
import net.paradisu.mcdevtools.testkit.env.TestEnvironment;
import net.raphimc.minecraftauth.MinecraftAuth;
import net.raphimc.minecraftauth.java.JavaAuthManager;
import net.raphimc.minecraftauth.java.model.MinecraftProfile;
import net.raphimc.minecraftauth.msa.data.MsaConstants;
import net.raphimc.minecraftauth.msa.model.MsaApplicationConfig;
import net.raphimc.minecraftauth.msa.model.MsaDeviceCode;
import net.raphimc.minecraftauth.msa.service.impl.DeviceCodeMsaAuthService;
import org.geysermc.mcprotocollib.auth.GameProfile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * Microsoft accounts for bots, needed only to pass an online-mode proxy (bots reach backends directly without one).
 *
 * <p>An account is logged in once with a device code ({@code mcdev bot login <name>}); the session is kept in the
 * project's cache folder with owner-only permissions and refreshed whenever it is used. Tokens never go into the
 * project config or the environment file, only the account's name does.
 */
public final class Accounts {
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_-]{1,32}");

    private Accounts() {}

    /**
     * Where an account's session is kept.
     *
     * @param env the environment
     * @param account the account name
     * @return the file
     */
    public static Path file(TestEnvironment env, String account) {
        if (!NAME.matcher(account).matches()) {
            throw new IllegalArgumentException("Account names are letters, digits, - and _: " + account);
        }
        return Path.of(env.accountsDir, account + ".json");
    }

    /**
     * Logs an account in with a device code and saves the session.
     *
     * @param env the environment
     * @param account the account name to save it as
     * @param prompt called with the code the user must enter at the verification address
     * @return the signed-in profile
     * @throws IOException when the login fails
     * @throws InterruptedException when interrupted while waiting for the user
     * @throws TimeoutException when the code expires
     */
    public static GameProfile login(TestEnvironment env, String account, Consumer<MsaDeviceCode> prompt)
            throws IOException, InterruptedException, TimeoutException {
        HttpClient http = MinecraftAuth.createHttpClient();
        // The device code flow needs an application id that allows it: the Minecraft launcher's own id does not, the
        // one of Minecraft for Nintendo Switch (which MinecraftAuth used for Java device code logins) does
        MsaApplicationConfig application =
                new MsaApplicationConfig(MsaConstants.BEDROCK_NINTENDO_TITLE_ID, MsaConstants.SCOPE_TITLE_AUTH);
        JavaAuthManager manager = JavaAuthManager.create(http)
                .msaApplicationConfig(application)
                .login(DeviceCodeMsaAuthService::new, prompt);
        MinecraftProfile profile = manager.getMinecraftProfile().getUpToDate();
        save(file(env, account), manager);
        return new GameProfile(profile.getId(), profile.getName());
    }

    /**
     * Builds bot options for a saved account, refreshing its session first.
     *
     * @param env the environment
     * @param account the account name
     * @return options named after the account's profile; add a target with {@code target(...)}
     */
    public static BotOptions options(TestEnvironment env, String account) {
        Path file = file(env, account);
        if (!Files.isRegularFile(file)) {
            throw new IllegalStateException(
                    "No saved account '" + account + "'; log in with `mcdev bot login " + account + "`");
        }
        try {
            JsonObject json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8))
                    .getAsJsonObject();
            JavaAuthManager manager = JavaAuthManager.fromJson(MinecraftAuth.createHttpClient(), json);
            String token = manager.getMinecraftToken().getUpToDate().getToken();
            MinecraftProfile profile = manager.getMinecraftProfile().getUpToDate();
            save(file, manager); // keep the refreshed tokens
            return BotOptions.named(profile.getName())
                    .account(new GameProfile(profile.getId(), profile.getName()), token);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Cannot use the saved account '" + account + "': " + e.getMessage()
                            + " (log in again with `mcdev bot login " + account + "`)",
                    e);
        }
    }

    private static void save(Path file, JavaAuthManager manager) throws IOException {
        Files.createDirectories(file.getParent());
        Files.writeString(file, JavaAuthManager.toJson(manager).toString(), StandardCharsets.UTF_8);
        try {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException ignored) {
            // not a POSIX file system
        }
    }
}
