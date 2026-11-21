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

package net.paradisu.mcdevtools.migrate;

import liquibase.Contexts;
import liquibase.LabelExpression;
import liquibase.Liquibase;
import liquibase.changelog.ChangeSet;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.DirectoryResourceAccessor;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;

/**
 * Liquibase runner used by {@code mcdev db}. Never shipped with a plugin.
 *
 * <p>Usage: {@code liquibase-runner --search-path <dir> --changelog <master.xml> [--url u] [--user u] [--password p]
 * <command> [arg]} where the command is one of {@code update-file <path>}, {@code update-all}, {@code unrun} or
 * {@code files}. Changelog paths resolve against the search path, as classpath resources would in the plugin itself, so
 * recorded file names match what the plugin's own migrations store. Connection settings default to the
 * {@code MCDEV_DB_*} environment variables ({@code MCDEV_DB_URL} overrides host, port and name).
 */
public final class LiquibaseRunner {
    private LiquibaseRunner() {}

    /**
     * Entry point.
     *
     * @param args command line arguments
     * @throws Exception if the command fails
     */
    public static void main(String[] args) throws Exception {
        String url = env(
                "MCDEV_DB_URL",
                "jdbc:postgresql://" + env("MCDEV_DB_HOST", "localhost") + ":" + env("MCDEV_DB_PORT", "5432") + "/"
                        + env("MCDEV_DB_NAME", "mcdev"));
        String user = env("MCDEV_DB_USER", "mcdev");
        String password = env("MCDEV_DB_PASSWORD", "mcdev");
        String searchPath = null;
        String master = null;

        List<String> positional = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--url" -> url = args[++i];
                case "--user" -> user = args[++i];
                case "--password" -> password = args[++i];
                case "--search-path" -> searchPath = args[++i];
                case "--changelog" -> master = args[++i];
                default -> positional.add(args[i]);
            }
        }
        if (positional.isEmpty()) {
            throw new IllegalArgumentException("Missing command: update-file <file> | update-all | unrun | files");
        }
        if (searchPath == null || master == null) {
            throw new IllegalArgumentException("--search-path and --changelog are required");
        }
        Path root = Path.of(searchPath);

        switch (positional.get(0)) {
            case "files" -> files(root, master);
            case "update-file" -> {
                if (positional.size() < 2) {
                    throw new IllegalArgumentException("update-file requires a changelog path");
                }
                update(url, user, password, root, positional.get(1));
            }
            case "update-all" -> update(url, user, password, root, master);
            case "unrun" -> unrun(url, user, password, root, master);
            default -> throw new IllegalArgumentException("Unknown command: " + positional.get(0));
        }
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    /** Prints the changelog files included by the master changelog, in order. */
    private static void files(Path root, String master) throws Exception {
        Path file = root.resolve(master);
        if (!Files.isRegularFile(file)) {
            throw new IllegalStateException("Could not find " + file);
        }
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        try (var in = Files.newInputStream(file)) {
            NodeList includes = factory.newDocumentBuilder().parse(in).getElementsByTagNameNS("*", "include");
            for (int i = 0; i < includes.getLength(); i++) {
                System.out.println(((Element) includes.item(i)).getAttribute("file"));
            }
        }
    }

    private static void update(String url, String user, String password, Path root, String changelog) throws Exception {
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            Database database =
                    DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
            try (Liquibase liquibase = new Liquibase(changelog, new DirectoryResourceAccessor(root), database)) {
                liquibase.update(new Contexts(), new LabelExpression());
            }
        }
    }

    /** Prints {@code id:file} for every changeset in the master changelog that has not run yet. */
    private static void unrun(String url, String user, String password, Path root, String master) throws Exception {
        try (Connection connection = DriverManager.getConnection(url, user, password)) {
            Database database =
                    DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
            try (Liquibase liquibase = new Liquibase(master, new DirectoryResourceAccessor(root), database)) {
                for (ChangeSet changeSet : liquibase.listUnrunChangeSets(new Contexts(), new LabelExpression())) {
                    System.out.println(changeSet.getId() + ":" + changeSet.getFilePath());
                }
            }
        }
    }
}
