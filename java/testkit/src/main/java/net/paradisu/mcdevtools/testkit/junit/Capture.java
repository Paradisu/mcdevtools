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

package net.paradisu.mcdevtools.testkit.junit;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Overrides the packet capture of a test (the default comes from {@code [test] capture} in the project config). */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface Capture {
    /** When to keep the capture. */
    enum Mode {
        /** Use the project's setting. */
        DEFAULT,
        /** Always keep and export it. */
        ALWAYS,
        /** Keep it only when the test fails. */
        ON_FAILURE,
        /** Do not capture. */
        NEVER
    }

    /**
     * The mode.
     *
     * @return the mode
     */
    Mode mode() default Mode.DEFAULT;

    /**
     * Export formats ({@code mcdev capture formats}); empty uses the project's setting.
     *
     * @return the formats
     */
    String[] export() default {};
}
