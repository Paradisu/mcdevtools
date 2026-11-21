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

package net.paradisu.mcdevtools.capture.agent;

import java.io.IOException;
import java.io.InputStream;

/**
 * Loads the netty-dependent capture classes (handlers, injector, bridge) in a loader whose parent is the class loader
 * that owns netty, so they can see netty whatever the platform's class loading looks like. The engine, control socket
 * and other netty-free classes stay in the system loader and are shared by every bundle, so there is one engine.
 */
final class BundleLoader extends ClassLoader {
    private static final String ROOT = "net.paradisu.mcdevtools.capture.";
    private static final String[] OWN = {ROOT + "netty.", ROOT + "agent.Bridge"};

    BundleLoader(ClassLoader nettyLoader) {
        super(nettyLoader == null ? ClassLoader.getSystemClassLoader() : nettyLoader);
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        synchronized (getClassLoadingLock(name)) {
            Class<?> loaded = findLoadedClass(name);
            if (loaded == null) {
                if (isOwn(name)) {
                    loaded = define(name);
                } else if (name.startsWith(ROOT)) {
                    // core, control: the shared copy in the system loader
                    loaded = ClassLoader.getSystemClassLoader().loadClass(name);
                } else {
                    loaded = super.loadClass(name, false);
                }
            }
            if (resolve) {
                resolveClass(loaded);
            }
            return loaded;
        }
    }

    private static boolean isOwn(String name) {
        for (String prefix : OWN) {
            if (name.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private Class<?> define(String name) throws ClassNotFoundException {
        // The agent jar is on the system class path, so its classes are readable as resources
        try (InputStream in = ClassLoader.getSystemResourceAsStream(name.replace('.', '/') + ".class")) {
            if (in == null) {
                throw new ClassNotFoundException(name);
            }
            byte[] bytes = in.readAllBytes();
            return defineClass(name, bytes, 0, bytes.length);
        } catch (IOException e) {
            throw new ClassNotFoundException(name, e);
        }
    }
}
