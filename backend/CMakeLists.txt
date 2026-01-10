cmake_minimum_required(VERSION 3.30)
project(HI111X C)

set(CMAKE_C_STANDARD 99)

set(BASE_SOURCES
        code/base/base_core.c
        code/base/base_arena.c
        code/base/base_string.c
        code/base/base_profile.c
)

set(SDL2_PATH "${CMAKE_SOURCE_DIR}/code/third_party/SDL2-x64")
add_library(SDL2_Common INTERFACE)
target_include_directories(SDL2_Common INTERFACE "${SDL2_PATH}/include/SDL2")
target_link_directories(SDL2_Common INTERFACE "${SDL2_PATH}/lib")
target_link_libraries(SDL2_Common INTERFACE
        SDL2
        SDL2_ttf
        SDL2_mixer
        SDL2_image
        SDL2_net
)

# Platform executable
add_executable(Platform code/platform/native_plaform.c ${BASE_SOURCES})
target_link_libraries(Platform PRIVATE SDL2_Common)
set_target_properties(Platform PROPERTIES LINK_FLAGS "-mconsole")

# Game shared library
add_library(Game SHARED code/game/game.c ${BASE_SOURCES})
target_link_libraries(Game PRIVATE SDL2_Common)

add_executable(Hot_server hot_reload/server_app.c)
target_link_libraries(Hot_server PRIVATE SDL2_Common)